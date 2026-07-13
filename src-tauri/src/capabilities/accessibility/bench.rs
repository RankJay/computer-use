//! Manual a11y timing harness. Not CI-safe; requires a real desktop session.
//!
//! ```text
//! cargo test -p actuate --features a11y-bench --test a11y_bench -- --ignored --nocapture
//! ```

use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::state::SnapshotStore;
use super::types::SnapshotInput;
use super::worker::{run, WorkerOutcome};

#[cfg(target_os = "macos")]
use super::ax::{
    resolve_reference_with_stats, snapshot_with_stats, take_ax_ipc_calls, AxAccessibilitySession,
    SnapshotStats,
};
#[cfg(windows)]
use super::uia::{
    resolve_reference_with_stats, snapshot_with_stats, SnapshotStats, UiaAccessibilitySession,
};

#[cfg(windows)]
use windows::core::BOOL;
#[cfg(windows)]
use windows::Win32::Foundation::{HWND, LPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible};

const RUNS: usize = 5;

#[derive(Debug, Clone)]
pub struct BenchSample {
    pub tool: &'static str,
    pub fixture: String,
    pub duration_ms: u64,
    pub nodes_visited: u32,
    pub emitted: u32,
    pub ipc_calls: Option<u64>,
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

    #[cfg(windows)]
    {
        if let Some(hwnd) = ensure_notepad_hwnd() {
            summaries.push(bench_snapshot("notepad", hwnd));
            summaries.push(bench_resolve("notepad", hwnd));
        } else {
            eprintln!("a11y-bench: could not open Notepad; skipping required fixture");
        }

        if let Some(hwnd) = ensure_explorer_hwnd() {
            summaries.push(bench_snapshot("explorer", hwnd));
            summaries.push(bench_resolve("explorer", hwnd));
        } else {
            eprintln!("a11y-bench: could not open Explorer; skipping optional fixture");
        }

        if let Some(hwnd) = find_window_title_contains(&["Chrome", "Edge", "Firefox", "Brave"]) {
            summaries.push(bench_snapshot("browser", hwnd));
            summaries.push(bench_resolve("browser", hwnd));
        } else {
            eprintln!("a11y-bench: no browser window found; skipping optional fixture");
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(hwnd) = ensure_textedit_hwnd() {
            summaries.push(bench_snapshot("textedit", hwnd));
            summaries.push(bench_resolve("textedit", hwnd));
        } else {
            eprintln!("a11y-bench: could not open TextEdit; skipping required fixture");
        }

        if let Some(hwnd) = find_hwnd_containing("finder") {
            summaries.push(bench_snapshot("finder", hwnd));
            summaries.push(bench_resolve("finder", hwnd));
        } else {
            eprintln!("a11y-bench: no Finder window found; skipping optional fixture");
        }

        if let Some(hwnd) =
            find_hwnd_containing_any(&["chrome", "safari", "firefox", "brave", "edge"])
        {
            summaries.push(bench_snapshot("browser", hwnd));
            summaries.push(bench_resolve("browser", hwnd));
        } else {
            eprintln!("a11y-bench: no browser window found; skipping optional fixture");
        }
    }

    summaries.push(bench_timeout_recovery());

    for summary in &summaries {
        print_summary(summary);
    }
    summaries
}

fn block_on_worker<T, F>(timeout: Duration, work: F) -> WorkerOutcome<T>
where
    T: Send + 'static,
    F: FnOnce(&mut super::worker::WorkerCtx) -> Result<T, CommandError> + Send + 'static,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("tokio runtime for a11y-bench");
    runtime.block_on(run(timeout, work))
}

fn bench_snapshot(fixture: &str, hwnd: WindowId) -> BenchSummary {
    let store = SnapshotStore::default();
    let mut samples = Vec::with_capacity(RUNS);
    for _ in 0..RUNS {
        let input = SnapshotInput {
            hwnd: Some(hwnd),
            reference: None,
            max_depth: 10,
            max_elements: 150,
        };
        let store_for_worker = store.clone();
        let started = Instant::now();
        let outcome = block_on_worker(Duration::from_secs(30), move |ctx| {
            #[cfg(target_os = "macos")]
            let _ = take_ax_ipc_calls();
            let deadline = ctx.deadline;
            let session = ctx.session_mut()?;
            #[cfg(windows)]
            {
                let uia = session
                    .as_any_mut()
                    .downcast_mut::<UiaAccessibilitySession>()
                    .ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::WorkerFailed,
                            "expected UiaAccessibilitySession",
                        )
                    })?;
                snapshot_with_stats(
                    &uia.inner,
                    &mut uia.arenas,
                    &store_for_worker,
                    input,
                    deadline,
                )
            }
            #[cfg(target_os = "macos")]
            {
                let ax = session
                    .as_any_mut()
                    .downcast_mut::<AxAccessibilitySession>()
                    .ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::WorkerFailed,
                            "expected AxAccessibilitySession",
                        )
                    })?;
                let result = snapshot_with_stats(
                    &ax.inner,
                    &mut ax.arenas,
                    &store_for_worker,
                    input,
                    deadline,
                )?;
                let ipc = take_ax_ipc_calls();
                Ok((result, ipc))
            }
        });
        let duration_ms = started.elapsed().as_millis() as u64;
        samples.push(sample_from_snapshot_outcome(fixture, duration_ms, outcome));
    }
    summarize("snapshot", fixture, samples)
}

#[cfg(windows)]
fn sample_from_snapshot_outcome(
    fixture: &str,
    duration_ms: u64,
    outcome: WorkerOutcome<(super::types::TextResult, SnapshotStats)>,
) -> BenchSample {
    match outcome {
        WorkerOutcome::Ok((
            _text,
            SnapshotStats {
                nodes_visited,
                emitted,
            },
        )) => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited,
            emitted,
            ipc_calls: None,
            ok: true,
            error: None,
        },
        WorkerOutcome::Err(error) => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: false,
            error: Some(format!("{}: {}", error.code, error.message)),
        },
        WorkerOutcome::TimedOut => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: false,
            error: Some("timed out".to_string()),
        },
    }
}

#[cfg(target_os = "macos")]
fn sample_from_snapshot_outcome(
    fixture: &str,
    duration_ms: u64,
    outcome: WorkerOutcome<((super::types::TextResult, SnapshotStats), u64)>,
) -> BenchSample {
    match outcome {
        WorkerOutcome::Ok((
            (
                _text,
                SnapshotStats {
                    nodes_visited,
                    emitted,
                },
            ),
            ipc_calls,
        )) => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited,
            emitted,
            ipc_calls: Some(ipc_calls),
            ok: true,
            error: None,
        },
        WorkerOutcome::Err(error) => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: false,
            error: Some(format!("{}: {}", error.code, error.message)),
        },
        WorkerOutcome::TimedOut => BenchSample {
            tool: "snapshot",
            fixture: fixture.to_string(),
            duration_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: false,
            error: Some("timed out".to_string()),
        },
    }
}

fn bench_resolve(fixture: &str, hwnd: WindowId) -> BenchSummary {
    let store = SnapshotStore::default();
    let input = SnapshotInput {
        hwnd: Some(hwnd),
        reference: None,
        max_depth: 10,
        max_elements: 150,
    };
    let store_for_snapshot = store.clone();
    let snapshot_outcome = block_on_worker(Duration::from_secs(30), move |ctx| {
        let deadline = ctx.deadline;
        let session = ctx.session_mut()?;
        #[cfg(windows)]
        {
            let uia = session
                .as_any_mut()
                .downcast_mut::<UiaAccessibilitySession>()
                .ok_or_else(|| {
                    CommandError::new(ErrorCode::WorkerFailed, "expected UiaAccessibilitySession")
                })?;
            snapshot_with_stats(
                &uia.inner,
                &mut uia.arenas,
                &store_for_snapshot,
                input,
                deadline,
            )
        }
        #[cfg(target_os = "macos")]
        {
            let ax = session
                .as_any_mut()
                .downcast_mut::<AxAccessibilitySession>()
                .ok_or_else(|| {
                    CommandError::new(ErrorCode::WorkerFailed, "expected AxAccessibilitySession")
                })?;
            snapshot_with_stats(
                &ax.inner,
                &mut ax.arenas,
                &store_for_snapshot,
                input,
                deadline,
            )
        }
    });
    let Ok((text, _)) = (match snapshot_outcome {
        WorkerOutcome::Ok(value) => Ok(value),
        WorkerOutcome::Err(error) => Err(error),
        WorkerOutcome::TimedOut => Err(CommandError::new(
            ErrorCode::SnapshotTimeout,
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
                ipc_calls: None,
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
                ipc_calls: None,
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
            #[cfg(target_os = "macos")]
            let _ = take_ax_ipc_calls();
            let session = ctx.session_mut()?;
            #[cfg(windows)]
            {
                let uia = session
                    .as_any_mut()
                    .downcast_mut::<UiaAccessibilitySession>()
                    .ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::WorkerFailed,
                            "expected UiaAccessibilitySession",
                        )
                    })?;
                resolve_reference_with_stats(&uia.inner, &store_for_worker, &reference_for_worker)
                    .map(|stats| (stats, None::<u64>))
            }
            #[cfg(target_os = "macos")]
            {
                let deadline = ctx.deadline;
                let ax = session
                    .as_any_mut()
                    .downcast_mut::<AxAccessibilitySession>()
                    .ok_or_else(|| {
                        CommandError::new(
                            ErrorCode::WorkerFailed,
                            "expected AxAccessibilitySession",
                        )
                    })?;
                let stats = resolve_reference_with_stats(
                    &ax.inner,
                    &store_for_worker,
                    &reference_for_worker,
                    deadline,
                )?;
                Ok((stats, Some(take_ax_ipc_calls())))
            }
        });
        let duration_ms = started.elapsed().as_millis() as u64;
        match outcome {
            WorkerOutcome::Ok((stats, ipc_calls)) => {
                samples.push(BenchSample {
                    tool: "resolve",
                    fixture: fixture.to_string(),
                    duration_ms,
                    nodes_visited: stats.nodes_visited,
                    emitted: 0,
                    ipc_calls,
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
                    ipc_calls: None,
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
                    ipc_calls: None,
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
        let ipc = sample
            .ipc_calls
            .map(|n| format!(" ipc_calls={n}"))
            .unwrap_or_default();
        println!(
            "tool={} fixture={} duration_ms={} nodes_visited={} emitted={}{} status={} {}",
            sample.tool,
            sample.fixture,
            sample.duration_ms,
            sample.nodes_visited,
            sample.emitted,
            ipc,
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

/// Induced slow job must not poison the next call (no a11y_busy cascade).
fn bench_timeout_recovery() -> BenchSummary {
    let started = Instant::now();
    let slow = block_on_worker(Duration::from_millis(80), |_| {
        thread::sleep(Duration::from_millis(500));
        Ok(())
    });
    let slow_ms = started.elapsed().as_millis() as u64;
    let slow_ok = matches!(slow, WorkerOutcome::TimedOut);

    let started_next = Instant::now();
    let next = block_on_worker(Duration::from_secs(2), |_| Ok(()));
    let next_ms = started_next.elapsed().as_millis() as u64;
    let next_ok = matches!(next, WorkerOutcome::Ok(()));
    // Give the slow job time to finish so later benches are not queued behind it.
    thread::sleep(Duration::from_millis(600));

    let samples = vec![
        BenchSample {
            tool: "timeout_recovery",
            fixture: "induced_slow".to_string(),
            duration_ms: slow_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: slow_ok,
            error: if slow_ok {
                None
            } else {
                Some("expected TimedOut for slow job".to_string())
            },
        },
        BenchSample {
            tool: "timeout_recovery",
            fixture: "induced_slow".to_string(),
            duration_ms: next_ms,
            nodes_visited: 0,
            emitted: 0,
            ipc_calls: None,
            ok: next_ok,
            error: if next_ok {
                None
            } else {
                Some(match next {
                    WorkerOutcome::Ok(()) => unreachable!(),
                    WorkerOutcome::TimedOut => "next job timed out".to_string(),
                    WorkerOutcome::Err(error) => {
                        format!("next job error: {}: {}", error.code, error.message)
                    }
                })
            },
        },
    ];
    summarize("timeout_recovery", "induced_slow", samples)
}

#[cfg(windows)]
fn ensure_notepad_hwnd() -> Option<WindowId> {
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

#[cfg(windows)]
fn ensure_explorer_hwnd() -> Option<WindowId> {
    if let Some(hwnd) =
        find_window_title_contains(&["File Explorer", "Exploring", "This PC", "Quick access"])
    {
        return Some(hwnd);
    }
    let _ = Command::new("explorer.exe").spawn().ok()?;
    for _ in 0..30 {
        thread::sleep(Duration::from_millis(150));
        if let Some(hwnd) =
            find_window_title_contains(&["File Explorer", "Exploring", "This PC", "Quick access"])
        {
            return Some(hwnd);
        }
    }
    None
}

#[cfg(windows)]
fn find_window_title_contains(needles: &[&str]) -> Option<WindowId> {
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

#[cfg(windows)]
struct EnumState {
    needles: Vec<String>,
    found: Option<WindowId>,
}

#[cfg(windows)]
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
        state.found = Some(WindowId(hwnd.0 as isize as i64));
        return BOOL(0);
    }
    BOOL(1)
}

#[cfg(target_os = "macos")]
fn ensure_textedit_hwnd() -> Option<WindowId> {
    if let Some(hwnd) = find_hwnd_containing("textedit") {
        return Some(hwnd);
    }
    let _ = Command::new("open").args(["-a", "TextEdit"]).spawn().ok()?;
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(100));
        if let Some(hwnd) = find_hwnd_containing("textedit") {
            return Some(hwnd);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn find_hwnd_containing(needle: &str) -> Option<WindowId> {
    find_hwnd_containing_any(&[needle])
}

#[cfg(target_os = "macos")]
fn find_hwnd_containing_any(needles: &[&str]) -> Option<WindowId> {
    let list = crate::capabilities::window::window_list().ok()?;
    for line in list.text.lines() {
        let lower = line.to_ascii_lowercase();
        if !needles.iter().any(|n| lower.contains(n)) {
            continue;
        }
        for token in line.split_whitespace() {
            if let Ok(id) = token.parse::<i64>() {
                if id > 0 {
                    return Some(WindowId(id));
                }
            }
        }
    }
    None
}
