use std::any::Any;
use std::sync::{LazyLock, Mutex, TryLockError};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::capabilities::path_utils::CommandError;

static A11Y_GATE: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

pub enum WorkerOutcome<T> {
    Ok(T),
    Err(CommandError),
    TimedOut,
}

pub fn with_a11y_gate<T, F>(work: F) -> Result<T, CommandError>
where
    F: FnOnce() -> Result<T, CommandError>,
{
    let _guard = A11Y_GATE.try_lock().map_err(|error| match error {
        TryLockError::WouldBlock => CommandError::new(
            "a11y_busy",
            "Another accessibility operation is already in progress",
        ),
        TryLockError::Poisoned(_) => CommandError::new(
            "a11y_busy",
            "Accessibility gate is unavailable",
        ),
    })?;
    work()
}

pub fn run_with_timeout<T, F>(timeout: Duration, work: F) -> WorkerOutcome<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, CommandError> + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| with_a11y_gate(work)));
        let response = match result {
            Ok(inner) => inner,
            Err(panic) => Err(CommandError::new("worker_panic", format_panic_payload(panic))),
        };
        let _ = sender.send(response);
    });

    match receiver.recv_timeout(timeout) {
        Ok(Ok(value)) => WorkerOutcome::Ok(value),
        Ok(Err(error)) => WorkerOutcome::Err(error),
        Err(mpsc::RecvTimeoutError::Timeout) => WorkerOutcome::TimedOut,
        Err(mpsc::RecvTimeoutError::Disconnected) => WorkerOutcome::Err(CommandError::new(
            "worker_failed",
            "Accessibility worker disconnected before returning a result",
        )),
    }
}

fn format_panic_payload(payload: Box<dyn Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "Accessibility worker panicked with an unknown payload".to_string()
}

pub fn map_worker_outcome<T>(
    outcome: WorkerOutcome<T>,
    timeout_code: &str,
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
    use std::time::Instant;

    #[test]
    fn timeout_wrapper_returns_before_deadline() {
        let started = Instant::now();
        let outcome = run_with_timeout(Duration::from_millis(50), || {
            thread::sleep(Duration::from_millis(500));
            Ok(())
        });
        assert!(matches!(outcome, WorkerOutcome::TimedOut));
        assert!(started.elapsed() < Duration::from_millis(250));
    }
}
