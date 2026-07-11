use crate::capabilities::error::CommandError;

use super::manager;
use super::types::{
    ActiveWindowResult, WindowActionResult, WindowId, WindowListResult, WindowMoveResult,
    WindowResizeResult, WindowStateOp, WindowStateResult,
};

#[tauri::command]
pub fn window_list() -> Result<WindowListResult, CommandError> {
    manager().list()
}

#[tauri::command]
pub fn window_focus(hwnd: WindowId) -> Result<WindowActionResult, CommandError> {
    manager().focus(hwnd)
}

#[tauri::command]
pub fn window_move(hwnd: WindowId, x: i32, y: i32) -> Result<WindowMoveResult, CommandError> {
    manager().move_window(hwnd, x, y)
}

#[tauri::command]
pub fn window_resize(
    hwnd: WindowId,
    width: i32,
    height: i32,
) -> Result<WindowResizeResult, CommandError> {
    manager().resize(hwnd, width, height)
}

#[tauri::command]
pub fn window_state(hwnd: WindowId, op: WindowStateOp) -> Result<WindowStateResult, CommandError> {
    manager().set_state(hwnd, op)
}

#[tauri::command]
pub fn get_active_window() -> Result<ActiveWindowResult, CommandError> {
    manager().active()
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::capabilities::error::{CommandError, ErrorCode};
    use crate::capabilities::window::manager::WindowManager;
    use crate::capabilities::window::types::WindowListResult;

    struct FakeWindowManager {
        windows: Mutex<Vec<(WindowId, String)>>,
        focused: Mutex<Option<WindowId>>,
    }

    impl FakeWindowManager {
        fn new(windows: Vec<(WindowId, String)>) -> Self {
            Self {
                windows: Mutex::new(windows),
                focused: Mutex::new(None),
            }
        }
    }

    impl WindowManager for FakeWindowManager {
        fn list(&self) -> Result<WindowListResult, CommandError> {
            let windows = self.windows.lock().expect("poisoned");
            let text = windows
                .iter()
                .map(|(id, title)| format!("{id}  fake.exe  \"{title}\""))
                .collect::<Vec<_>>()
                .join("\n");
            Ok(WindowListResult { text })
        }

        fn focus(&self, id: WindowId) -> Result<WindowActionResult, CommandError> {
            let windows = self.windows.lock().expect("poisoned");
            if !windows.iter().any(|(w, _)| *w == id) {
                return Err(CommandError::new(
                    ErrorCode::InvalidHwnd,
                    "Window handle is not valid",
                ));
            }
            *self.focused.lock().expect("poisoned") = Some(id);
            Ok(WindowActionResult { ok: true, id })
        }

        fn move_window(
            &self,
            id: WindowId,
            x: i32,
            y: i32,
        ) -> Result<WindowMoveResult, CommandError> {
            Ok(WindowMoveResult { ok: true, id, x, y })
        }

        fn resize(
            &self,
            id: WindowId,
            width: i32,
            height: i32,
        ) -> Result<WindowResizeResult, CommandError> {
            Ok(WindowResizeResult {
                ok: true,
                id,
                width,
                height,
            })
        }

        fn set_state(
            &self,
            id: WindowId,
            op: WindowStateOp,
        ) -> Result<WindowStateResult, CommandError> {
            let op_name = match op {
                WindowStateOp::Minimize => "minimize",
                WindowStateOp::Maximize => "maximize",
                WindowStateOp::Restore => "restore",
                WindowStateOp::Close => "close",
            };
            Ok(WindowStateResult {
                ok: true,
                id,
                op: op_name.to_string(),
            })
        }

        fn active(&self) -> Result<ActiveWindowResult, CommandError> {
            let windows = self.windows.lock().expect("poisoned");
            let (id, title) = windows.first().ok_or_else(|| {
                CommandError::new(
                    ErrorCode::NoActiveWindow,
                    "No foreground window is available",
                )
            })?;
            Ok(ActiveWindowResult {
                id: *id,
                title: Some(title.clone()),
                process_name: Some("fake.exe".to_string()),
            })
        }
    }

    #[test]
    fn fake_list_returns_canned_windows() {
        let mgr = FakeWindowManager::new(vec![
            (WindowId(111), "One".into()),
            (WindowId(222), "Two".into()),
        ]);
        let result = mgr.list().expect("list");
        assert!(result.text.contains("111  fake.exe  \"One\""));
        assert!(result.text.contains("222  fake.exe  \"Two\""));
    }

    #[test]
    fn fake_focus_records_id() {
        let mgr = FakeWindowManager::new(vec![(WindowId(42), "Target".into())]);
        let result = mgr.focus(WindowId(42)).expect("focus");
        assert!(result.ok);
        assert_eq!(result.id, WindowId(42));
        assert_eq!(*mgr.focused.lock().expect("poisoned"), Some(WindowId(42)));
    }

    #[test]
    fn wire_json_keeps_hwnd_keys() {
        let action = WindowActionResult {
            ok: true,
            id: WindowId(99),
        };
        let json = serde_json::to_value(&action).expect("serialize");
        assert_eq!(json["ok"], true);
        assert_eq!(json["hwnd"], 99);
        assert!(json.get("id").is_none());

        let active = ActiveWindowResult {
            id: WindowId(7),
            title: Some("Hi".into()),
            process_name: None,
        };
        let json = serde_json::to_value(&active).expect("serialize");
        assert_eq!(json["hwnd"], 7);
        assert_eq!(json["title"], "Hi");
    }
}
