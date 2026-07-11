//! Persistent a11y worker thread.
//!
//! Owns the platform session (COM apartment on Windows). All platform element
//! handles must live and die on this thread — nothing crosses a thread seam.

use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use crate::capabilities::error::{CommandError, ErrorCode};

use super::provider::AccessibilitySession;

const QUEUE_CAPACITY: usize = 8;

pub enum WorkerOutcome<T> {
    Ok(T),
    Err(CommandError),
    TimedOut,
}

pub struct WorkerCtx {
    pub deadline: Instant,
    session: Result<Box<dyn AccessibilitySession>, CommandError>,
}

impl WorkerCtx {
    pub fn session_mut(&mut self) -> Result<&mut dyn AccessibilitySession, CommandError> {
        match &mut self.session {
            Ok(session) => Ok(session.as_mut()),
            Err(error) => Err(error.clone()),
        }
    }
}

struct Job {
    deadline: Instant,
    work: Box<dyn FnOnce(&mut WorkerCtx) + Send + 'static>,
}

static JOB_TX: OnceLock<SyncSender<Job>> = OnceLock::new();

fn job_sender() -> &'static SyncSender<Job> {
    JOB_TX.get_or_init(|| {
        let (tx, rx) = sync_channel(QUEUE_CAPACITY);
        thread::Builder::new()
            .name("a11y-worker".to_string())
            .spawn(move || worker_loop(rx))
            .expect("failed to spawn a11y worker thread");
        tx
    })
}

fn worker_loop(rx: Receiver<Job>) {
    // create_session must run on this thread (COM/AX affinity).
    let session = super::provider().create_session();
    let mut ctx = WorkerCtx {
        deadline: Instant::now(),
        session,
    };

    while let Ok(job) = rx.recv() {
        ctx.deadline = job.deadline;
        (job.work)(&mut ctx);
    }
}

/// Run `work` on the persistent a11y worker. Caller timeout returns `TimedOut`
/// while the worker still finishes the job and then takes the next one.
pub async fn run<T, F>(timeout: Duration, work: F) -> WorkerOutcome<T>
where
    T: Send + 'static,
    F: FnOnce(&mut WorkerCtx) -> Result<T, CommandError> + Send + 'static,
{
    let deadline = Instant::now() + timeout;
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

    let job = Job {
        deadline,
        work: Box::new(move |ctx| {
            let result = if Instant::now() >= deadline {
                Err(CommandError::new(
                    ErrorCode::DeadlineExceeded,
                    "Accessibility job expired while queued",
                ))
            } else {
                work(ctx)
            };
            let _ = reply_tx.send(result);
        }),
    };

    match job_sender().try_send(job) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            return WorkerOutcome::Err(CommandError::new(
                ErrorCode::A11yBusy,
                "Accessibility worker queue is full",
            ));
        }
        Err(TrySendError::Disconnected(_)) => {
            return WorkerOutcome::Err(CommandError::new(
                ErrorCode::WorkerFailed,
                "Accessibility worker disconnected before accepting a job",
            ));
        }
    }

    match tokio::time::timeout(timeout, reply_rx).await {
        Ok(Ok(Ok(value))) => WorkerOutcome::Ok(value),
        Ok(Ok(Err(error))) => WorkerOutcome::Err(error),
        Ok(Err(_)) => WorkerOutcome::Err(CommandError::new(
            ErrorCode::WorkerFailed,
            "Accessibility worker disconnected before returning a result",
        )),
        Err(_) => WorkerOutcome::TimedOut,
    }
}

pub fn map_worker_outcome<T>(
    outcome: WorkerOutcome<T>,
    timeout_code: ErrorCode,
    timeout_message: &str,
) -> Result<T, CommandError> {
    match outcome {
        WorkerOutcome::Ok(value) => Ok(value),
        WorkerOutcome::Err(error) => Err(error),
        WorkerOutcome::TimedOut => Err(CommandError::new(timeout_code, timeout_message)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn timeout_returns_before_deadline_and_does_not_poison_next_job() {
        let started = Instant::now();
        let outcome = run(Duration::from_millis(50), |_| {
            thread::sleep(Duration::from_millis(400));
            Ok(())
        })
        .await;
        assert!(matches!(outcome, WorkerOutcome::TimedOut));
        assert!(started.elapsed() < Duration::from_millis(250));

        // Wait for the slow job to finish on the worker, then a short job must succeed.
        thread::sleep(Duration::from_millis(500));
        let follow_up = run(Duration::from_millis(500), |_| Ok(42_u32)).await;
        assert!(matches!(follow_up, WorkerOutcome::Ok(42)));
    }
}
