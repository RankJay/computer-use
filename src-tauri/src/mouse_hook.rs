//! Pointer helpers shared by capture and input automation.

#[cfg(target_os = "windows")]
mod win {
    use windows::Win32::Foundation::POINT;

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
pub use win::{cursor_position, set_cursor_position};

#[cfg(not(target_os = "windows"))]
pub fn cursor_position() -> Result<(i32, i32), String> {
    Err("cursor position: only supported on Windows in this build".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn set_cursor_position(_x: i32, _y: i32) -> Result<(), String> {
    Err("set cursor: only supported on Windows in this build".to_string())
}
