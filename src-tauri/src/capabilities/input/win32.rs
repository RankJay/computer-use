//! Win32 adapter for [`super::synthesizer::InputSynthesizer`].

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

use crate::capabilities::error::{CommandError, ErrorCode, OkResult};

use super::keys::Key;
use super::synthesizer::InputSynthesizer;
use super::types::MouseButton;

pub struct Win32InputSynthesizer;

impl InputSynthesizer for Win32InputSynthesizer {
    fn mouse_move(&self, x: i32, y: i32) -> Result<OkResult, CommandError> {
        set_cursor_pos(x, y)?;
        Ok(OkResult { ok: true })
    }

    fn mouse_button_down(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        maybe_move(x, y)?;
        let (down, _) = button_flags(button);
        send_inputs(&[mouse_input(down, 0)])?;
        Ok(OkResult { ok: true })
    }

    fn mouse_button_up(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        maybe_move(x, y)?;
        let (_, up) = button_flags(button);
        send_inputs(&[mouse_input(up, 0)])?;
        Ok(OkResult { ok: true })
    }

    fn mouse_click(
        &self,
        button: MouseButton,
        count: u32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
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

    fn mouse_scroll(
        &self,
        dx: i32,
        dy: i32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
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

    fn mouse_drag(
        &self,
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

    fn mouse_hover(&self, x: i32, y: i32, ms: u64) -> Result<OkResult, CommandError> {
        set_cursor_pos(x, y)?;
        if ms > 0 {
            thread::sleep(Duration::from_millis(ms.min(30_000)));
        }
        Ok(OkResult { ok: true })
    }

    fn key_down(&self, key: Key) -> Result<OkResult, CommandError> {
        send_inputs(&[key_input(virtual_key(key), false)])?;
        Ok(OkResult { ok: true })
    }

    fn key_up(&self, key: Key) -> Result<OkResult, CommandError> {
        send_inputs(&[key_input(virtual_key(key), true)])?;
        Ok(OkResult { ok: true })
    }

    fn key_press(&self, key: Key, count: u32) -> Result<OkResult, CommandError> {
        let vk = virtual_key(key);
        let mut inputs = Vec::with_capacity((count as usize) * 2);
        for _ in 0..count {
            inputs.push(key_input(vk, false));
            inputs.push(key_input(vk, true));
        }
        send_inputs(&inputs)?;
        Ok(OkResult { ok: true })
    }

    fn hotkey(&self, keys: &[Key]) -> Result<OkResult, CommandError> {
        let vks: Vec<u16> = keys.iter().copied().map(virtual_key).collect();
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

fn virtual_key(key: Key) -> u16 {
    match key {
        Key::Ctrl => 0x11,
        Key::Shift => 0x10,
        Key::Alt => 0x12,
        Key::Win => 0x5B,
        Key::Enter => 0x0D,
        Key::Tab => 0x09,
        Key::Escape => 0x1B,
        Key::Space => 0x20,
        Key::Backspace => 0x08,
        Key::Delete => 0x2E,
        Key::Up => 0x26,
        Key::Down => 0x28,
        Key::Left => 0x25,
        Key::Right => 0x27,
        Key::Home => 0x24,
        Key::End => 0x23,
        Key::PageUp => 0x21,
        Key::PageDown => 0x22,
        Key::Insert => 0x2D,
        Key::CapsLock => 0x14,
        Key::F1 => 0x70,
        Key::F2 => 0x71,
        Key::F3 => 0x72,
        Key::F4 => 0x73,
        Key::F5 => 0x74,
        Key::F6 => 0x75,
        Key::F7 => 0x76,
        Key::F8 => 0x77,
        Key::F9 => 0x78,
        Key::F10 => 0x79,
        Key::F11 => 0x7A,
        Key::F12 => 0x7B,
        Key::A => 0x41,
        Key::B => 0x42,
        Key::C => 0x43,
        Key::D => 0x44,
        Key::E => 0x45,
        Key::F => 0x46,
        Key::G => 0x47,
        Key::H => 0x48,
        Key::I => 0x49,
        Key::J => 0x4A,
        Key::K => 0x4B,
        Key::L => 0x4C,
        Key::M => 0x4D,
        Key::N => 0x4E,
        Key::O => 0x4F,
        Key::P => 0x50,
        Key::Q => 0x51,
        Key::R => 0x52,
        Key::S => 0x53,
        Key::T => 0x54,
        Key::U => 0x55,
        Key::V => 0x56,
        Key::W => 0x57,
        Key::X => 0x58,
        Key::Y => 0x59,
        Key::Z => 0x5A,
        Key::Digit0 => 0x30,
        Key::Digit1 => 0x31,
        Key::Digit2 => 0x32,
        Key::Digit3 => 0x33,
        Key::Digit4 => 0x34,
        Key::Digit5 => 0x35,
        Key::Digit6 => 0x36,
        Key::Digit7 => 0x37,
        Key::Digit8 => 0x38,
        Key::Digit9 => 0x39,
        Key::Slash => 0xBF,
        Key::Backslash => 0xDC,
        Key::Period => 0xBE,
        Key::Comma => 0xBC,
        Key::Minus => 0xBD,
        Key::Equals => 0xBB,
        Key::Semicolon => 0xBA,
        Key::Quote => 0xDE,
        Key::Backtick => 0xC0,
        Key::LBracket => 0xDB,
        Key::RBracket => 0xDD,
    }
}

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

fn set_cursor_pos(x: i32, y: i32) -> Result<(), CommandError> {
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

fn maybe_move(x: Option<i32>, y: Option<i32>) -> Result<(), CommandError> {
    match (x, y) {
        (Some(x), Some(y)) => set_cursor_pos(x, y),
        (None, None) => Ok(()),
        _ => Err(CommandError::new(
            ErrorCode::InvalidCoordinates,
            "Provide both x and y, or neither",
        )),
    }
}
