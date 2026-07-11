//! Manual UIA timing harness. Not CI-safe; requires a real Windows desktop session.
//!
//! ```text
//! cargo test -p actuate --features a11y-bench --test a11y_bench -- --ignored --nocapture
//! ```

use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible};

use super::state::SnapshotStore;
use super::types::SnapshotInput;
use super::windows_impl::{resolve_reference_with_stats, snapshot_with_stats, SnapshotStats};
use super::worker::{run, WorkerOutcome};

const RUNS: usize = 5;

#[derive(Debug, Clone)]
pub struct BenchSample {
    pub tool: &'static str,
    pub fixture: String,
    pub duration_ms: u64,
    pub nodes_visited: u32,
    pub emitted: u32,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct BenchSummary {
    pub tool: &'static str,
    pub fixture: String,
    pub samples: Vec<BenchSample>,
    pub p50_ms: u64,
    pub p95_ms: u64,
}

pub fn run_all() -> Vec<BenchSummary> {
    let mut summaries = Vec::new();

    if let Some(hwnd) = ensure_notepad_hwnd() {
        summaries.push(bench_snapshot("notepad", hwnd));
        summaries.push(bench_resolve("notepad", hwnd));
    } else {
        eprintln!("a11y-bench: could not open Notepad; skipping required fixture");
    }

    if let Some(hwnd) = find_window_title_contains(&["Chrome", "Edge", "Firefox", "Brave"]) {
        summaries.push(bench_snapshot("browser", hwnd));
        summaries.push(bench_resolve("browser", hwnd));
    } else {
        eprintln!("a11y-bench: no browser window found; skipping optional fixture");
    }

    for summary in &summaries {
        print_summary(summary);
    }
    summaries
}

fn block_on_worker<T, F>(timeout: Duration, work: F) -> WorkerOutcome<T>
where
    T: Send + 'static,
    F: FnOnce(
            &mut super::worker::WorkerCtx,
        ) -> Result<T, crate::capabilities::path_utils::CommandError>
        + Send
        + 'static,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("tokio runtime for a11y-bench");
    runtime.block_on(run(timeout, work))
}

fn bench_snapshot(fixture: &str, hwnd: i64) -> BenchSummary {
    let store = SnapshotStore::default();
    let mut samples = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let input = SnapshotInput {
            hwnd,
            max_depth: 10,
            max_elements: 150,
        };
        let store_for_worker = store.clone();
        let started = Instant::now();
        let outcome = block_on_worker(Duration::from_secs(30), move |ctx| {
            let session = ctx.session()?;
            snapshot_with_stats(session, &store_for_worker, input, ctx.deadline)
        });
        let duration_ms = started.elapsed().as_millis() as u64;
        match outcome {
            WorkerOutcome::Ok((
                _text,
                SnapshotStats {
                    nodes_visited,
                    emitted,
                },
            )) => {
                samples.push(BenchSample {
                    tool: "snapshot",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited,
                    emitted,
                    ok: true,
                    error: None,
                });
            }
            WorkerOutcome::Err(error) => {
                samples.push(BenchSample {
                    tool: "snapshot",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: 0,
                    emitted: 0,
                    ok: false,
                    error: Some(format!("{}: {}", error.code, error.message)),
                });
            }
            WorkerOutcome::TimedOut => {
                samples.push(BenchSample {
                    tool: "snapshot",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: 0,
                    emitted: 0,
                    ok: false,
                    error: Some("timed out".to_string()),
                });
            }
        }
    }
    summarize("snapshot", fixture, samples)
}

fn bench_resolve(fixture: &str, hwnd: i64) -> BenchSummary {
    let store = SnapshotStore::default();
    let input = SnapshotInput {
        hwnd,
        max_depth: 10,
        max_elements: 150,
    };
    let store_for_snapshot = store.clone();
    let snapshot_outcome = block_on_worker(Duration::from_secs(30), move |ctx| {
        let session = ctx.session()?;
        snapshot_with_stats(session, &store_for_snapshot, input, ctx.deadline)
    });
    let Ok((text, _)) = (match snapshot_outcome {
        WorkerOutcome::Ok(value) => Ok(value),
        WorkerOutcome::Err(error) => Err(error),
        WorkerOutcome::TimedOut => Err(crate::capabilities::path_utils::CommandError::new(
            "snapshot_timeout",
            "snapshot timed out before resolve",
        )),
    }) else {
        return summarize(
            "resolve",
            fixture,
            vec![BenchSample {
                tool: "resolve",
                fixture: fixture.to_string(),
                duration_ms: 0,
                nodes_visited: 0,
                emitted: 0,
                ok: false,
                error: Some("snapshot failed before resolve".to_string()),
            }],
        );
    };

    let Some(reference) = first_reference(&text.text) else {
        return summarize(
            "resolve",
            fixture,
            vec![BenchSample {
                tool: "resolve",
                fixture: fixture.to_string(),
                duration_ms: 0,
                nodes_visited: 0,
                emitted: 0,
                ok: false,
                error: Some("no reference in snapshot outline".to_string()),
            }],
        );
    };

    let mut samples = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let store_for_worker = store.clone();
        let reference_for_worker = reference.clone();
        let started = Instant::now();
        let outcome = block_on_worker(Duration::from_secs(10), move |ctx| {
            let session = ctx.session()?;
            resolve_reference_with_stats(session, &store_for_worker, &reference_for_worker)
        });
        let duration_ms = started.elapsed().as_millis() as u64;
        match outcome {
            WorkerOutcome::Ok(stats) => {
                samples.push(BenchSample {
                    tool: "resolve",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: stats.nodes_visited,
                    emitted: 0,
                    ok: true,
                    error: None,
                });
            }
            WorkerOutcome::Err(error) => {
                samples.push(BenchSample {
                    tool: "resolve",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: 0,
                    emitted: 0,
                    ok: false,
                    error: Some(format!("{}: {}", error.code, error.message)),
                });
            }
            WorkerOutcome::TimedOut => {
                samples.push(BenchSample {
                    tool: "resolve",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: 0,
                    emitted: 0,
                    ok: false,
                    error: Some("timed out".to_string()),
                });
            }
        }
    }
    summarize("resolve", fixture, samples)
}

fn summarize(tool: &'static str, fixture: &str, samples: Vec<BenchSample>) -> BenchSummary {
    let mut durations: Vec<u64> = samples.iter().map(|s| s.duration_ms).collect();
    durations.sort_unstable();
    let p50_ms = percentile(&durations, 50);
    let p95_ms = percentile(&durations, 95);
    BenchSummary {
        tool,
        fixture: fixture.to_string(),
        samples,
        p50_ms,
        p95_ms,
    }
}

fn percentile(sorted: &[u64], pct: u8) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let rank = ((pct as usize) * (sorted.len() - 1)) / 100;
    sorted[rank]
}

fn print_summary(summary: &BenchSummary) {
    for sample in &summary.samples {
        let status = if sample.ok { "ok" } else { "err" };
        let err = sample.error.as_deref().unwrap_or("");
        println!(
            "tool={} fixture={} duration_ms={} nodes_visited={} emitted={} status={} {}",
            sample.tool,
            sample.fixture,
            sample.duration_ms,
            sample.nodes_visited,
            sample.emitted,
            status,
            err
        );
    }
    println!(
        "summary tool={} fixture={} p50_ms={} p95_ms={} runs={}",
        summary.tool,
        summary.fixture,
        summary.p50_ms,
        summary.p95_ms,
        summary.samples.len()
    );
}

fn first_reference(outline: &str) -> Option<String> {
    for token in outline.split_whitespace() {
        if token.starts_with('e') && token.contains('@') {
            return Some(token.to_string());
        }
    }
    None
}

fn ensure_notepad_hwnd() -> Option<i64> {
    if let Some(hwnd) = find_window_title_contains(&["Notepad", "Untitled - Notepad"]) {
        return Some(hwnd);
    }
    let _ = Command::new("notepad.exe").spawn().ok()?;
    for _ in 0..20 {
        thread::sleep(Duration::from_millis(100));
        if let Some(hwnd) = find_window_title_contains(&["Notepad", "Untitled - Notepad"]) {
            return Some(hwnd);
        }
    }
    None
}

fn find_window_title_contains(needles: &[&str]) -> Option<i64> {
    let mut state = EnumState {
        needles: needles.iter().map(|s| (*s).to_string()).collect(),
        found: None,
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut state as *mut EnumState as isize),
        );
    }
    state.found
}

struct EnumState {
    needles: Vec<String>,
    found: Option<i64>,
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);
    if state.found.is_some() {
        return BOOL(0);
    }
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    let mut buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut buf);
    if len == 0 {
        return BOOL(1);
    }
    let title = String::from_utf16_lossy(&buf[..len as usize]);
    if state.needles.iter().any(|needle| title.contains(needle)) {
        state.found = Some(hwnd.0 as isize as i64);
        return BOOL(0);
    }
    BOOL(1)
}
