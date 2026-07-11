#[cfg(not(target_os = "windows"))]
use crate::capabilities::error::unsupported_platform;
use crate::capabilities::error::{CommandError, ErrorCode, OkResult};

use super::keys::{parse_key, parse_keys};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

impl MouseButton {
    pub fn parse(value: &str) -> Result<Self, CommandError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "middle" => Ok(Self::Middle),
            other => Err(CommandError::new(
                ErrorCode::InvalidButton,
                format!("Unsupported mouse button: {other}"),
            )),
        }
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::mem::size_of;
    use std::thread;
    use std::time::Duration;

    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_KEYUP, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
        MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
        MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SetCursorPos, SM_CXSCREEN, SM_CYSCREEN, WHEEL_DELTA,
    };

    use super::*;

    fn send_inputs(inputs: &[INPUT]) -> Result<(), CommandError> {
        if inputs.is_empty() {
            return Ok(());
        }
        let sent = unsafe {
            SendInput(
                inputs,
                size_of::<INPUT>().try_into().expect("INPUT size fits i32"),
            )
        };
        if sent as usize != inputs.len() {
            return Err(CommandError::new(
                ErrorCode::SendInputFailed,
                format!("SendInput accepted {sent} of {} events", inputs.len()),
            ));
        }
        Ok(())
    }

    fn mouse_input(flags: MOUSE_EVENT_FLAGS, mouse_data: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: mouse_data as u32,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn key_input(vk: u16, up: bool) -> INPUT {
        let flags = if up {
            KEYEVENTF_KEYUP
        } else {
            KEYBD_EVENT_FLAGS(0)
        };
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    fn button_flags(button: MouseButton) -> (MOUSE_EVENT_FLAGS, MOUSE_EVENT_FLAGS) {
        match button {
            MouseButton::Left => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
            MouseButton::Right => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
            MouseButton::Middle => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        }
    }

    pub fn set_cursor_pos(x: i32, y: i32) -> Result<(), CommandError> {
        let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
        let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
        if width <= 0 || height <= 0 {
            return Err(CommandError::new(
                ErrorCode::CursorMoveFailed,
                "Could not read screen metrics",
            ));
        }
        // Allow a small margin for multi-monitor virtual desktop edges.
        if x < -width * 2 || y < -height * 2 || x > width * 3 || y > height * 3 {
            return Err(CommandError::new(
                ErrorCode::InvalidCoordinates,
                format!("Coordinates ({x}, {y}) are outside a reasonable screen range"),
            ));
        }
        unsafe {
            SetCursorPos(x, y).map_err(|error| {
                CommandError::new(
                    ErrorCode::CursorMoveFailed,
                    format!("SetCursorPos failed: {error}"),
                )
            })?;
        }
        Ok(())
    }

    pub fn maybe_move(x: Option<i32>, y: Option<i32>) -> Result<(), CommandError> {
        match (x, y) {
            (Some(x), Some(y)) => set_cursor_pos(x, y),
            (None, None) => Ok(()),
            _ => Err(CommandError::new(
                ErrorCode::InvalidCoordinates,
                "Provide both x and y, or neither",
            )),
        }
    }

    pub fn mouse_move(x: i32, y: i32) -> Result<OkResult, CommandError> {
        set_cursor_pos(x, y)?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_button_down(
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        maybe_move(x, y)?;
        let (down, _) = button_flags(button);
        send_inputs(&[mouse_input(down, 0)])?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_button_up(
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        maybe_move(x, y)?;
        let (_, up) = button_flags(button);
        send_inputs(&[mouse_input(up, 0)])?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_click(
        button: MouseButton,
        count: u32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        if count == 0 {
            return Err(CommandError::new(
                ErrorCode::InvalidCount,
                "Click count must be at least 1",
            ));
        }
        maybe_move(x, y)?;
        let (down, up) = button_flags(button);
        let mut inputs = Vec::with_capacity((count as usize) * 2);
        for _ in 0..count {
            inputs.push(mouse_input(down, 0));
            inputs.push(mouse_input(up, 0));
        }
        send_inputs(&inputs)?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_scroll(
        dx: i32,
        dy: i32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        if dx == 0 && dy == 0 {
            return Err(CommandError::new(
                ErrorCode::InvalidScroll,
                "At least one of dx or dy must be non-zero",
            ));
        }
        maybe_move(x, y)?;
        let mut inputs = Vec::new();
        if dy != 0 {
            let data = dy.saturating_mul(WHEEL_DELTA as i32);
            inputs.push(mouse_input(MOUSEEVENTF_WHEEL, data));
        }
        if dx != 0 {
            let data = dx.saturating_mul(WHEEL_DELTA as i32);
            inputs.push(mouse_input(MOUSEEVENTF_HWHEEL, data));
        }
        send_inputs(&inputs)?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_drag(
        x0: i32,
        y0: i32,
        x1: i32,
        y1: i32,
        button: MouseButton,
        steps: u32,
    ) -> Result<OkResult, CommandError> {
        let steps = steps.max(1);
        set_cursor_pos(x0, y0)?;
        let (down, up) = button_flags(button);
        send_inputs(&[mouse_input(down, 0)])?;

        for step in 1..=steps {
            let t = step as f64 / steps as f64;
            let x = (x0 as f64 + (x1 - x0) as f64 * t).round() as i32;
            let y = (y0 as f64 + (y1 - y0) as f64 * t).round() as i32;
            set_cursor_pos(x, y)?;
            thread::sleep(Duration::from_millis(8));
        }

        send_inputs(&[mouse_input(up, 0)])?;
        Ok(OkResult { ok: true })
    }

    pub fn mouse_hover(x: i32, y: i32, ms: u64) -> Result<OkResult, CommandError> {
        set_cursor_pos(x, y)?;
        if ms > 0 {
            thread::sleep(Duration::from_millis(ms.min(30_000)));
        }
        Ok(OkResult { ok: true })
    }

    pub fn key_down(key: &str) -> Result<OkResult, CommandError> {
        let vk = parse_key(key)?;
        send_inputs(&[key_input(vk, false)])?;
        Ok(OkResult { ok: true })
    }

    pub fn key_up(key: &str) -> Result<OkResult, CommandError> {
        let vk = parse_key(key)?;
        send_inputs(&[key_input(vk, true)])?;
        Ok(OkResult { ok: true })
    }

    pub fn key_press(key: &str, count: u32) -> Result<OkResult, CommandError> {
        if count == 0 {
            return Err(CommandError::new(
                ErrorCode::InvalidCount,
                "Key press count must be at least 1",
            ));
        }
        let vk = parse_key(key)?;
        let mut inputs = Vec::with_capacity((count as usize) * 2);
        for _ in 0..count {
            inputs.push(key_input(vk, false));
            inputs.push(key_input(vk, true));
        }
        send_inputs(&inputs)?;
        Ok(OkResult { ok: true })
    }

    pub fn hotkey(keys: &[String]) -> Result<OkResult, CommandError> {
        let vks = parse_keys(keys)?;
        let mut inputs = Vec::with_capacity(vks.len() * 2);
        for vk in &vks {
            inputs.push(key_input(*vk, false));
        }
        for vk in vks.iter().rev() {
            inputs.push(key_input(*vk, true));
        }
        send_inputs(&inputs)?;
        Ok(OkResult { ok: true })
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{
    hotkey, key_down, key_press, key_up, mouse_button_down, mouse_button_up, mouse_click,
    mouse_drag, mouse_hover, mouse_move, mouse_scroll,
};

#[cfg(not(target_os = "windows"))]
mod stubs {
    use super::*;

    fn unsupported<T>() -> Result<T, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    pub fn mouse_move(_x: i32, _y: i32) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_button_down(
        _button: MouseButton,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_button_up(
        _button: MouseButton,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_click(
        _button: MouseButton,
        _count: u32,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_scroll(
        _dx: i32,
        _dy: i32,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_drag(
        _x0: i32,
        _y0: i32,
        _x1: i32,
        _y1: i32,
        _button: MouseButton,
        _steps: u32,
    ) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn mouse_hover(_x: i32, _y: i32, _ms: u64) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn key_down(_key: &str) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn key_up(_key: &str) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn key_press(_key: &str, _count: u32) -> Result<OkResult, CommandError> {
        unsupported()
    }

    pub fn hotkey(_keys: &[String]) -> Result<OkResult, CommandError> {
        unsupported()
    }
}

#[cfg(not(target_os = "windows"))]
pub use stubs::{
    hotkey, key_down, key_press, key_up, mouse_button_down, mouse_button_up, mouse_click,
    mouse_drag, mouse_hover, mouse_move, mouse_scroll,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mouse_buttons() {
        assert_eq!(MouseButton::parse("left").unwrap(), MouseButton::Left);
        assert_eq!(MouseButton::parse("RIGHT").unwrap(), MouseButton::Right);
        assert_eq!(MouseButton::parse("middle").unwrap(), MouseButton::Middle);
        assert_eq!(
            MouseButton::parse("other").unwrap_err().code,
            "invalid_button"
        );
    }

    #[test]
    fn click_rejects_zero_count() {
        let error = mouse_click(MouseButton::Left, 0, None, None).expect_err("zero");
        assert!(error.code == "invalid_count" || error.code == "unsupported_platform");
    }

    #[test]
    fn key_press_rejects_zero_count() {
        let error = key_press("a", 0).expect_err("zero");
        assert!(error.code == "invalid_count" || error.code == "unsupported_platform");
    }
}
