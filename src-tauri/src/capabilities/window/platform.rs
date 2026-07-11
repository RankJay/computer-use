use crate::capabilities::path_utils::CommandError;

use super::types::{
    ActiveWindowResult, WindowActionResult, WindowListResult, WindowMoveResult, WindowResizeResult,
    WindowStateOp, WindowStateResult, TIMEOUT_LIST_WINDOWS_MS,
};

#[cfg(not(target_os = "windows"))]
pub fn unsupported_platform<T>() -> Result<T, CommandError> {
    Err(CommandError::new(
        "unsupported_platform",
        "Window management is only supported on Windows",
    ))
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::path::Path;
    use std::time::Duration;

    use windows::core::BOOL;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsWindow, IsWindowVisible,
        PostMessageW, SendMessageTimeoutW, SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOP,
        SMTO_ABORTIFHUNG, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, WM_CLOSE, WM_GETTEXT,
    };

    use super::*;

    const ENUM_CONTINUE: BOOL = BOOL(1);
    const SWP_NOZORDER: windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS =
        windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(0x0004);
    const SWP_NOSIZE: windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS =
        windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(0x0001);
    const SWP_NOMOVE: windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS =
        windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS(0x0002);

    pub fn hwnd_from_i64(hwnd: i64) -> Result<HWND, CommandError> {
        if hwnd == 0 {
            return Err(CommandError::new(
                "invalid_hwnd",
                "Window handle must not be zero",
            ));
        }
        let handle = HWND(hwnd as isize as *mut _);
        if !unsafe { IsWindow(Some(handle)).as_bool() } {
            return Err(CommandError::new(
                "invalid_hwnd",
                "Window handle is not valid",
            ));
        }
        Ok(handle)
    }

    pub fn process_name_from_pid(process_id: u32) -> Option<String> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
            let mut buffer = [0u16; 1024];
            let mut size = buffer.len() as u32;
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                windows::core::PWSTR(buffer.as_mut_ptr()),
                &mut size,
            )
            .ok()?;
            let path = String::from_utf16_lossy(&buffer[..size as usize]);
            let _ = CloseHandle(process);
            Path::new(&path)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        }
    }

    /// Per-window title read budget. GetWindowTextW can block forever on a hung UI thread;
    /// SendMessageTimeout + ABORTIFHUNG keeps EnumWindows moving.
    const TITLE_TIMEOUT_MS: u32 = 50;

    fn window_title(hwnd: HWND) -> Option<String> {
        let mut title_buffer = [0u16; 512];
        let mut result = 0usize;
        let sent = unsafe {
            SendMessageTimeoutW(
                hwnd,
                WM_GETTEXT,
                WPARAM(title_buffer.len()),
                LPARAM(title_buffer.as_mut_ptr() as isize),
                SMTO_ABORTIFHUNG,
                TITLE_TIMEOUT_MS,
                Some(&mut result),
            )
        };
        if sent.0 == 0 || result == 0 {
            return None;
        }
        let title_len = result.min(title_buffer.len().saturating_sub(1));
        let title = String::from_utf16_lossy(&title_buffer[..title_len]);
        if title.is_empty() {
            None
        } else {
            Some(title)
        }
    }

    pub fn list_windows_impl() -> Result<WindowListResult, CommandError> {
        // Phase 1: EnumWindows only collects hwnd/title/pid (fast). Process-image
        // queries can stall on elevated/hung processes — do those after, with a budget,
        // so we still return a list instead of timing out the whole command.
        let mut collector = WindowCollector {
            entries: Vec::new(),
        };
        unsafe {
            EnumWindows(
                Some(enum_visible_window),
                LPARAM(&mut collector as *mut WindowCollector as isize),
            )
            .map_err(|error| CommandError::new("window_enum_failed", error.to_string()))?;
        }

        // Leave headroom under TIMEOUT_LIST_WINDOWS_MS for channel/send overhead.
        let name_deadline = std::time::Instant::now()
            + Duration::from_millis(TIMEOUT_LIST_WINDOWS_MS.saturating_sub(500));
        let mut lines = Vec::with_capacity(collector.entries.len());
        for entry in collector.entries {
            let process_name = if std::time::Instant::now() < name_deadline {
                process_name_from_pid(entry.process_id)
                    .unwrap_or_else(|| format!("pid:{}", entry.process_id))
            } else {
                format!("pid:{}", entry.process_id)
            };
            lines.push(format!(
                "{}  {}  \"{}\"",
                entry.hwnd, process_name, entry.title
            ));
        }

        Ok(WindowListResult {
            text: lines.join("\n"),
        })
    }

    struct WindowEntry {
        hwnd: i64,
        title: String,
        process_id: u32,
    }

    struct WindowCollector {
        entries: Vec<WindowEntry>,
    }

    unsafe extern "system" fn enum_visible_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let collector = &mut *(lparam.0 as *mut WindowCollector);
        if !IsWindowVisible(hwnd).as_bool() {
            return ENUM_CONTINUE;
        }

        let Some(title) = window_title(hwnd) else {
            return ENUM_CONTINUE;
        };

        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        collector.entries.push(WindowEntry {
            hwnd: hwnd.0 as i64,
            title,
            process_id,
        });
        ENUM_CONTINUE
    }

    pub fn focus_window_impl(hwnd: i64) -> Result<WindowActionResult, CommandError> {
        let handle = hwnd_from_i64(hwnd)?;
        let focused = unsafe { SetForegroundWindow(handle) };
        if !focused.as_bool() {
            return Err(CommandError::new(
                "focus_failed",
                "Could not bring window to foreground",
            ));
        }
        Ok(WindowActionResult { ok: true, hwnd })
    }

    pub fn window_state_impl(
        hwnd: i64,
        op: WindowStateOp,
    ) -> Result<WindowStateResult, CommandError> {
        let handle = hwnd_from_i64(hwnd)?;
        let op_name = match op {
            WindowStateOp::Minimize => {
                unsafe {
                    let _ = ShowWindow(handle, SW_MINIMIZE);
                }
                "minimize"
            }
            WindowStateOp::Maximize => {
                unsafe {
                    let _ = ShowWindow(handle, SW_MAXIMIZE);
                }
                "maximize"
            }
            WindowStateOp::Restore => {
                unsafe {
                    let _ = ShowWindow(handle, SW_RESTORE);
                }
                "restore"
            }
            WindowStateOp::Close => {
                unsafe {
                    PostMessageW(Some(handle), WM_CLOSE, WPARAM(0), LPARAM(0))
                        .map_err(|error| CommandError::new("close_failed", error.to_string()))?;
                }
                "close"
            }
        };

        Ok(WindowStateResult {
            ok: true,
            hwnd,
            op: op_name.to_string(),
        })
    }

    pub fn move_window_impl(hwnd: i64, x: i32, y: i32) -> Result<WindowMoveResult, CommandError> {
        let handle = hwnd_from_i64(hwnd)?;
        unsafe {
            SetWindowPos(
                handle,
                Some(HWND_TOP),
                x,
                y,
                0,
                0,
                SWP_NOZORDER | SWP_NOSIZE,
            )
            .map_err(|error| CommandError::new("move_failed", error.to_string()))?;
        }
        Ok(WindowMoveResult {
            ok: true,
            hwnd,
            x,
            y,
        })
    }

    pub fn resize_window_impl(
        hwnd: i64,
        width: i32,
        height: i32,
    ) -> Result<WindowResizeResult, CommandError> {
        if width <= 0 || height <= 0 {
            return Err(CommandError::new(
                "invalid_size",
                "Width and height must be positive",
            ));
        }

        let handle = hwnd_from_i64(hwnd)?;
        unsafe {
            SetWindowPos(
                handle,
                Some(HWND_TOP),
                0,
                0,
                width,
                height,
                SWP_NOZORDER | SWP_NOMOVE,
            )
            .map_err(|error| CommandError::new("resize_failed", error.to_string()))?;
        }
        Ok(WindowResizeResult {
            ok: true,
            hwnd,
            width,
            height,
        })
    }

    pub fn get_active_window_impl() -> Result<ActiveWindowResult, CommandError> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.0.is_null() {
            return Err(CommandError::new(
                "no_active_window",
                "No foreground window is available",
            ));
        }

        let hwnd_value = hwnd.0 as i64;
        let mut process_id = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };

        Ok(ActiveWindowResult {
            hwnd: hwnd_value,
            title: window_title(hwnd),
            process_name: process_name_from_pid(process_id),
        })
    }

    pub fn run_with_list_timeout<F, T>(timeout_ms: u64, work: F) -> Result<T, CommandError>
    where
        F: FnOnce() -> Result<T, CommandError> + Send + 'static,
        T: Send + 'static,
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let _ = sender.send(work());
        });

        match receiver.recv_timeout(Duration::from_millis(timeout_ms)) {
            Ok(result) => result,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => Err(CommandError::new(
                "list_windows_timeout",
                "Listing windows timed out",
            )),
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(CommandError::new(
                "worker_failed",
                "Window worker task failed",
            )),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::time::Instant;

        #[test]
        fn rejects_zero_hwnd() {
            let error = hwnd_from_i64(0).expect_err("zero hwnd should fail");
            assert_eq!(error.code, "invalid_hwnd");
        }

        #[test]
        fn rejects_non_positive_resize() {
            let error = resize_window_impl(1, 0, 100).expect_err("invalid width");
            assert_eq!(error.code, "invalid_size");
        }

        /// Live diagnostic: `cargo test -p actuate --lib diagnose_window_list_latency -- --ignored --nocapture`
        #[test]
        #[ignore = "live desktop probe; run manually when window_list misbehaves"]
        fn diagnose_window_list_latency() {
            static VISIBLE_ONLY: AtomicUsize = AtomicUsize::new(0);
            unsafe extern "system" fn count_visible(hwnd: HWND, _: LPARAM) -> BOOL {
                if IsWindowVisible(hwnd).as_bool() {
                    VISIBLE_ONLY.fetch_add(1, Ordering::Relaxed);
                }
                ENUM_CONTINUE
            }

            let t0 = Instant::now();
            unsafe {
                let _ = EnumWindows(Some(count_visible), LPARAM(0));
            }
            let visible_ms = t0.elapsed().as_millis();
            let visible_count = VISIBLE_ONLY.load(Ordering::Relaxed);

            let t1 = Instant::now();
            let listed = list_windows_impl();
            let list_ms = t1.elapsed().as_millis();

            let t2 = Instant::now();
            let wrapped = run_with_list_timeout(TIMEOUT_LIST_WINDOWS_MS, list_windows_impl);
            let wrap_ms = t2.elapsed().as_millis();

            let line_count = listed
                .as_ref()
                .ok()
                .map(|r| r.text.lines().count())
                .unwrap_or(0);

            let report = format!(
                "window_list diagnose: visible_only={visible_count} in {visible_ms}ms; \
                 list_windows_impl lines={line_count} in {list_ms}ms ok={}; \
                 wrapped in {wrap_ms}ms ok={}\n",
                listed.is_ok(),
                wrapped.is_ok()
            );
            let mut full = report.clone();
            if let Err(error) = &wrapped {
                full.push_str(&format!(
                    "wrapped error: {} — {}\n",
                    error.code, error.message
                ));
            }
            if let Ok(result) = &listed {
                let preview: Vec<_> = result.text.lines().take(8).collect();
                full.push_str(&format!("preview:\n{}\n", preview.join("\n")));
            }
            let out = std::env::temp_dir().join("actuate_window_list_diagnose.txt");
            std::fs::write(&out, &full).expect("write diagnose");
            eprintln!("{full}");
            println!("wrote diagnose to {}", out.display());

            assert!(
                list_ms < 10_000,
                "list_windows_impl took {list_ms}ms — likely hung GetWindowTextW in EnumWindows"
            );
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{
    focus_window_impl, get_active_window_impl, list_windows_impl, move_window_impl,
    resize_window_impl, run_with_list_timeout, window_state_impl,
};
