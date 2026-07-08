use std::time::{Duration, Instant};

use serde::Serialize;

use crate::capabilities::path_utils::CommandError;

const MIN_MS: u64 = 1;
const MAX_MS: u64 = 60_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitResult {
    pub ms: u64,
    pub elapsed_ms: u64,
}

#[tauri::command]
pub fn wait(ms: u64) -> Result<WaitResult, CommandError> {
    if !(MIN_MS..=MAX_MS).contains(&ms) {
        return Err(CommandError::new(
            "invalid_duration",
            format!("Duration must be between {MIN_MS} and {MAX_MS} milliseconds"),
        ));
    }

    let started = Instant::now();
    std::thread::sleep(Duration::from_millis(ms));
    let elapsed_ms = started.elapsed().as_millis() as u64;

    Ok(WaitResult { ms, elapsed_ms })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_zero_duration() {
        let error = wait(0).expect_err("should reject zero");
        assert_eq!(error.code, "invalid_duration");
    }

    #[test]
    fn rejects_duration_above_max() {
        let error = wait(MAX_MS + 1).expect_err("should reject above max");
        assert_eq!(error.code, "invalid_duration");
    }

    #[test]
    fn sleeps_for_requested_duration() {
        let result = wait(50).expect("wait should succeed");
        assert_eq!(result.ms, 50);
        assert!(result.elapsed_ms >= 50);
    }
}
