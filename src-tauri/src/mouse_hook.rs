//! Swallows physical mouse input while keeping the keyboard path free (Esc can reach the webview).
//! Windows only: WH_MOUSE_LL. Other platforms: no-op.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

#[cfg(target_os = "windows")]
mod win {
    use super::{AtomicBool, Ordering, mpsc, thread, Duration, OnceLock};
    use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, PeekMessageW, SetWindowsHookExW, TranslateMessage,
        MSG, PM_REMOVE, WH_MOUSE_LL,
    };

    static SWALLOW_MOUSE: AtomicBool = AtomicBool::new(false);
    static HOOK_THREAD_READY: OnceLock<()> = OnceLock::new();

    unsafe extern "system" fn low_level_mouse_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 && SWALLOW_MOUSE.load(Ordering::SeqCst) {
            return LRESULT(1);
        }
        unsafe { CallNextHookEx(None, code, wparam, lparam) }
    }

    fn ensure_hook_thread() {
        HOOK_THREAD_READY.get_or_init(|| {
            let (tx, rx) = mpsc::sync_channel(0);
            thread::spawn(move || {
                let hook = unsafe {
                    SetWindowsHookExW(
                        WH_MOUSE_LL,
                        Some(low_level_mouse_proc),
                        Some(
                            GetModuleHandleW(None)
                                .expect("GetModuleHandleW for WH_MOUSE_LL")
                                .into(),
                        ),
                        0,
                    )
                }
                .expect("SetWindowsHookExW(WH_MOUSE_LL)");
                let _keep_hook_alive = hook;
                tx.send(()).expect("mouse hook thread ready");
                loop {
                    unsafe {
                        let mut msg = MSG::default();
                        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                            let _ = TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }
                    }
                    thread::sleep(Duration::from_millis(5));
                }
            });
            rx.recv().expect("mouse hook thread started");
        });
    }

    pub fn set_swallow_mouse(active: bool) {
        ensure_hook_thread();
        SWALLOW_MOUSE.store(active, Ordering::SeqCst);
    }

    pub fn cursor_position() -> Result<(i32, i32), String> {
        let mut pt = POINT::default();
        unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt) }
            .map_err(|e| e.to_string())?;
        Ok((pt.x, pt.y))
    }

    pub fn set_cursor_position(x: i32, y: i32) -> Result<(), String> {
        unsafe { windows::Win32::UI::WindowsAndMessaging::SetCursorPos(x, y) }
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "windows")]
pub use win::{cursor_position, set_cursor_position, set_swallow_mouse};

#[cfg(not(target_os = "windows"))]
pub fn set_swallow_mouse(_active: bool) {}

#[cfg(not(target_os = "windows"))]
pub fn cursor_position() -> Result<(i32, i32), String> {
    Err("cursor position: only supported on Windows in this build".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn set_cursor_position(_x: i32, _y: i32) -> Result<(), String> {
    Err("set cursor: only supported on Windows in this build".to_string())
}

pub struct MouseSwallowGuard {
    active: bool,
}

impl MouseSwallowGuard {
    pub fn enter() -> Self {
        #[cfg(target_os = "windows")]
        set_swallow_mouse(true);
        Self { active: true }
    }
}

impl Drop for MouseSwallowGuard {
    fn drop(&mut self) {
        if !self.active {
            return;
        }
        #[cfg(target_os = "windows")]
        set_swallow_mouse(false);
    }
}
