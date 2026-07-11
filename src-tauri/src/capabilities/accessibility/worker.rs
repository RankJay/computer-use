//! Persistent a11y worker thread.
//!
//! Owns the COM apartment for the process's accessibility path. The
//! `uiautomation` crate uses `COINIT_MULTITHREADED`; we match that here and
//! create `IUIAutomation` once via `UIAutomation::new_direct()` after a single
//! `CoInitializeEx`. All `UIElement` / walker / cache objects must live and die
//! on this thread — nothing COM crosses a thread seam.

use std::collections::HashMap;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::arena::HwndArena;

const QUEUE_CAPACITY: usize = 8;

pub enum WorkerOutcome<T> {
    Ok(T),
    Err(CommandError),
    TimedOut,
}

pub struct WorkerCtx {
    pub deadline: Instant,
    #[cfg(windows)]
    session: Result<super::windows_impl::UiaSession, CommandError>,
    /// Last extracted tree per window (worker-thread-local).
    pub arenas: HashMap<WindowId, HwndArena>,
}

impl WorkerCtx {
    #[cfg(windows)]
    pub fn resources(
        &mut self,
    ) -> Result<
        (
            &super::windows_impl::UiaSession,
            &mut HashMap<WindowId, HwndArena>,
            Instant,
        ),
        CommandError,
    > {
        let deadline = self.deadline;
        let session = match &self.session {
            Ok(session) => session,
            Err(error) => return Err(error.clone()),
        };
        Ok((session, &mut self.arenas, deadline))
    }

    #[cfg(windows)]
    pub fn session(&self) -> Result<&super::windows_impl::UiaSession, CommandError> {
        match &self.session {
            Ok(session) => Ok(session),
            Err(error) => Err(error.clone()),
        }
    }

    #[cfg(not(windows))]
    pub fn session(&self) -> Result<(), CommandError> {
        Err(unsupported_platform("Accessibility automation"))
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
    #[cfg(windows)]
    let session = {
        // Apartment: COINIT_MULTITHREADED — same model as uiautomation::UIAutomation::new.
        let hr = unsafe {
            windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            )
        };
        if hr.is_err() {
            Err(CommandError::new(
                ErrorCode::UiaInitFailed,
                format!("CoInitializeEx failed: {hr:?}"),
            ))
        } else {
            super::windows_impl::UiaSession::init_on_worker_thread()
        }
    };

    #[cfg(not(windows))]
    let _ = ();

    let mut ctx = WorkerCtx {
        deadline: Instant::now(),
        #[cfg(windows)]
        session,
        arenas: HashMap::new(),
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
