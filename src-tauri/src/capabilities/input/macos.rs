//! macOS adapter for [`super::synthesizer::InputSynthesizer`].
//!
//! Posts Core Graphics events via `CGEventPost`. Coordinates use **global display
//! space with origin at the top-left of the main display** (same convention as
//! `CGEventCreateMouseEvent` / AX window positions / `window_move`). On Retina
//! displays these are **points (logical)**, not device pixels — keep agent tools
//! and window geometry in that same space.
//!
//! Prefer `kCGHIDEventTap`. If events are ignored under HID-only delivery, switch
//! the post site to `kCGSessionEventTap` (CGEventPost has no error return).
//! Posting requires Accessibility (`CGPreflightPostEventAccess`).

use std::thread;
use std::time::Duration;

use objc2_core_foundation::CGPoint;
use objc2_core_graphics::{
    CGDisplayBounds, CGError, CGEvent, CGEventField, CGEventSource, CGEventSourceStateID,
    CGEventTapLocation, CGEventType, CGKeyCode, CGMainDisplayID, CGMouseButton,
    CGPreflightPostEventAccess, CGRequestPostEventAccess, CGScrollEventUnit,
    CGWarpMouseCursorPosition,
};

use crate::capabilities::error::{CommandError, ErrorCode, OkResult};

use super::keys::Key;
use super::synthesizer::InputSynthesizer;
use super::types::MouseButton;

const INPUT_PERMISSION_HINT: &str =
    "Grant Accessibility for Actuate in System Settings → Privacy & Security → Accessibility (Input Monitoring may also be required)";

pub struct MacosInputSynthesizer;

impl InputSynthesizer for MacosInputSynthesizer {
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
        let point = resolve_point(x, y)?;
        post_mouse(button_down_type(button), button, point, 1)?;
        Ok(OkResult { ok: true })
    }

    fn mouse_button_up(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        let point = resolve_point(x, y)?;
        post_mouse(button_up_type(button), button, point, 1)?;
        Ok(OkResult { ok: true })
    }

    fn mouse_click(
        &self,
        button: MouseButton,
        count: u32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        let point = resolve_point(x, y)?;
        let down = button_down_type(button);
        let up = button_up_type(button);
        for click in 1..=count {
            post_mouse(down, button, point, click)?;
            post_mouse(up, button, point, click)?;
            if click < count {
                thread::sleep(Duration::from_millis(40));
            }
        }
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
        require_post_access()?;
        let source = event_source()?;
        // Axis 1 = vertical (positive = up), axis 2 = horizontal.
        let event =
            CGEvent::new_scroll_wheel_event2(Some(&source), CGScrollEventUnit::Line, 2, dy, dx, 0)
                .ok_or_else(|| {
                    CommandError::new(
                        ErrorCode::SendInputFailed,
                        format!("CGEventCreateScrollWheelEvent failed. {INPUT_PERMISSION_HINT}"),
                    )
                })?;
        if let (Some(px), Some(py)) = (x, y) {
            CGEvent::set_location(Some(&event), point(px, py));
        }
        post_event(&event);
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
        post_mouse(button_down_type(button), button, point(x0, y0), 1)?;

        let drag_type = button_drag_type(button);
        for step in 1..=steps {
            let t = step as f64 / steps as f64;
            let x = (x0 as f64 + (x1 - x0) as f64 * t).round() as i32;
            let y = (y0 as f64 + (y1 - y0) as f64 * t).round() as i32;
            validate_coords(x, y)?;
            post_mouse(drag_type, button, point(x, y), 1)?;
            thread::sleep(Duration::from_millis(8));
        }

        post_mouse(button_up_type(button), button, point(x1, y1), 1)?;
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
        post_key(virtual_key(key), true)?;
        Ok(OkResult { ok: true })
    }

    fn key_up(&self, key: Key) -> Result<OkResult, CommandError> {
        post_key(virtual_key(key), false)?;
        Ok(OkResult { ok: true })
    }

    fn key_press(&self, key: Key, count: u32) -> Result<OkResult, CommandError> {
        let code = virtual_key(key);
        for _ in 0..count {
            post_key(code, true)?;
            post_key(code, false)?;
        }
        Ok(OkResult { ok: true })
    }

    fn hotkey(&self, keys: &[Key]) -> Result<OkResult, CommandError> {
        let codes: Vec<CGKeyCode> = keys.iter().copied().map(virtual_key).collect();
        for code in &codes {
            post_key(*code, true)?;
        }
        for code in codes.iter().rev() {
            post_key(*code, false)?;
        }
        Ok(OkResult { ok: true })
    }
}

fn virtual_key(key: Key) -> CGKeyCode {
    // HIToolbox / Events.h virtual key codes (ANSI US layout).
    match key {
        Key::Ctrl => 0x3B,      // kVK_Control
        Key::Shift => 0x38,     // kVK_Shift
        Key::Alt => 0x3A,       // kVK_Option
        Key::Win => 0x37,       // kVK_Command
        Key::Enter => 0x24,     // kVK_Return
        Key::Tab => 0x30,       // kVK_Tab
        Key::Escape => 0x35,    // kVK_Escape
        Key::Space => 0x31,     // kVK_Space
        Key::Backspace => 0x33, // kVK_Delete
        Key::Delete => 0x75,    // kVK_ForwardDelete
        Key::Up => 0x7E,        // kVK_UpArrow
        Key::Down => 0x7D,      // kVK_DownArrow
        Key::Left => 0x7B,      // kVK_LeftArrow
        Key::Right => 0x7C,     // kVK_RightArrow
        Key::Home => 0x73,      // kVK_Home
        Key::End => 0x77,       // kVK_End
        Key::PageUp => 0x74,    // kVK_PageUp
        Key::PageDown => 0x79,  // kVK_PageDown
        Key::Insert => 0x72,    // kVK_Help
        Key::CapsLock => 0x39,  // kVK_CapsLock
        Key::F1 => 0x7A,
        Key::F2 => 0x78,
        Key::F3 => 0x63,
        Key::F4 => 0x76,
        Key::F5 => 0x60,
        Key::F6 => 0x61,
        Key::F7 => 0x62,
        Key::F8 => 0x64,
        Key::F9 => 0x65,
        Key::F10 => 0x6D,
        Key::F11 => 0x67,
        Key::F12 => 0x6F,
        Key::A => 0x00,
        Key::B => 0x0B,
        Key::C => 0x08,
        Key::D => 0x02,
        Key::E => 0x0E,
        Key::F => 0x03,
        Key::G => 0x05,
        Key::H => 0x04,
        Key::I => 0x22,
        Key::J => 0x26,
        Key::K => 0x28,
        Key::L => 0x25,
        Key::M => 0x2E,
        Key::N => 0x2D,
        Key::O => 0x1F,
        Key::P => 0x23,
        Key::Q => 0x0C,
        Key::R => 0x0F,
        Key::S => 0x01,
        Key::T => 0x11,
        Key::U => 0x20,
        Key::V => 0x09,
        Key::W => 0x0D,
        Key::X => 0x07,
        Key::Y => 0x10,
        Key::Z => 0x06,
        Key::Digit0 => 0x1D,
        Key::Digit1 => 0x12,
        Key::Digit2 => 0x13,
        Key::Digit3 => 0x14,
        Key::Digit4 => 0x15,
        Key::Digit5 => 0x17,
        Key::Digit6 => 0x16,
        Key::Digit7 => 0x1A,
        Key::Digit8 => 0x1C,
        Key::Digit9 => 0x19,
        Key::Slash => 0x2C,
        Key::Backslash => 0x2A,
        Key::Period => 0x2F,
        Key::Comma => 0x2B,
        Key::Minus => 0x1B,
        Key::Equals => 0x18,
        Key::Semicolon => 0x29,
        Key::Quote => 0x27,
        Key::Backtick => 0x32,
        Key::LBracket => 0x21,
        Key::RBracket => 0x1E,
    }
}

fn cg_button(button: MouseButton) -> CGMouseButton {
    match button {
        MouseButton::Left => CGMouseButton::Left,
        MouseButton::Right => CGMouseButton::Right,
        MouseButton::Middle => CGMouseButton::Center,
    }
}

fn button_down_type(button: MouseButton) -> CGEventType {
    match button {
        MouseButton::Left => CGEventType::LeftMouseDown,
        MouseButton::Right => CGEventType::RightMouseDown,
        MouseButton::Middle => CGEventType::OtherMouseDown,
    }
}

fn button_up_type(button: MouseButton) -> CGEventType {
    match button {
        MouseButton::Left => CGEventType::LeftMouseUp,
        MouseButton::Right => CGEventType::RightMouseUp,
        MouseButton::Middle => CGEventType::OtherMouseUp,
    }
}

fn button_drag_type(button: MouseButton) -> CGEventType {
    match button {
        MouseButton::Left => CGEventType::LeftMouseDragged,
        MouseButton::Right => CGEventType::RightMouseDragged,
        MouseButton::Middle => CGEventType::OtherMouseDragged,
    }
}

fn point(x: i32, y: i32) -> CGPoint {
    CGPoint::new(x as f64, y as f64)
}

fn event_source() -> Result<objc2_core_foundation::CFRetained<CGEventSource>, CommandError> {
    CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok_or_else(|| {
        CommandError::new(
            ErrorCode::SendInputFailed,
            format!("CGEventSourceCreate failed. {INPUT_PERMISSION_HINT}"),
        )
    })
}

fn require_post_access() -> Result<(), CommandError> {
    if CGPreflightPostEventAccess() {
        return Ok(());
    }
    // Prompt once; still fail so the caller sees a clear grant message.
    let _ = CGRequestPostEventAccess();
    Err(CommandError::new(
        ErrorCode::AccessibilityPermissionDenied,
        format!("Posting input events was denied. {INPUT_PERMISSION_HINT}"),
    ))
}

fn post_event(event: &CGEvent) {
    CGEvent::post(CGEventTapLocation::HIDEventTap, Some(event));
}

fn post_mouse(
    event_type: CGEventType,
    button: MouseButton,
    location: CGPoint,
    click_state: u32,
) -> Result<(), CommandError> {
    require_post_access()?;
    let source = event_source()?;
    let event = CGEvent::new_mouse_event(Some(&source), event_type, location, cg_button(button))
        .ok_or_else(|| {
            CommandError::new(
                ErrorCode::SendInputFailed,
                format!("CGEventCreateMouseEvent failed. {INPUT_PERMISSION_HINT}"),
            )
        })?;
    if click_state > 1 {
        CGEvent::set_integer_value_field(
            Some(&event),
            CGEventField::MouseEventClickState,
            click_state as i64,
        );
    }
    post_event(&event);
    Ok(())
}

fn post_key(code: CGKeyCode, key_down: bool) -> Result<(), CommandError> {
    require_post_access()?;
    let source = event_source()?;
    let event = CGEvent::new_keyboard_event(Some(&source), code, key_down).ok_or_else(|| {
        CommandError::new(
            ErrorCode::SendInputFailed,
            format!("CGEventCreateKeyboardEvent failed. {INPUT_PERMISSION_HINT}"),
        )
    })?;
    post_event(&event);
    Ok(())
}

fn main_display_size() -> Result<(i32, i32), CommandError> {
    let bounds = CGDisplayBounds(CGMainDisplayID());
    let width = bounds.size.width.round() as i32;
    let height = bounds.size.height.round() as i32;
    if width <= 0 || height <= 0 {
        return Err(CommandError::new(
            ErrorCode::CursorMoveFailed,
            "Could not read main display bounds",
        ));
    }
    Ok((width, height))
}

fn validate_coords(x: i32, y: i32) -> Result<(), CommandError> {
    let (width, height) = main_display_size()?;
    // Allow a small margin for multi-monitor virtual desktop edges (mirrors Win32).
    if x < -width * 2 || y < -height * 2 || x > width * 3 || y > height * 3 {
        return Err(CommandError::new(
            ErrorCode::InvalidCoordinates,
            format!("Coordinates ({x}, {y}) are outside a reasonable screen range"),
        ));
    }
    Ok(())
}

fn set_cursor_pos(x: i32, y: i32) -> Result<(), CommandError> {
    validate_coords(x, y)?;
    require_post_access()?;
    let location = point(x, y);
    let warp = CGWarpMouseCursorPosition(location);
    if warp != CGError::Success {
        return Err(CommandError::new(
            ErrorCode::CursorMoveFailed,
            format!("CGWarpMouseCursorPosition failed ({})", warp.0),
        ));
    }
    // Also post a moved event so apps observe the cursor change.
    post_mouse(CGEventType::MouseMoved, MouseButton::Left, location, 1)?;
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

fn resolve_point(x: Option<i32>, y: Option<i32>) -> Result<CGPoint, CommandError> {
    match (x, y) {
        (Some(x), Some(y)) => {
            validate_coords(x, y)?;
            Ok(point(x, y))
        }
        (None, None) => current_cursor_pos(),
        _ => Err(CommandError::new(
            ErrorCode::InvalidCoordinates,
            "Provide both x and y, or neither",
        )),
    }
}

fn current_cursor_pos() -> Result<CGPoint, CommandError> {
    let event = CGEvent::new(None).ok_or_else(|| {
        CommandError::new(
            ErrorCode::CursorMoveFailed,
            "Could not read current cursor position",
        )
    })?;
    Ok(CGEvent::location(Some(&event)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn win_maps_to_command_keycode() {
        assert_eq!(virtual_key(Key::Win), 0x37);
    }

    #[test]
    fn letter_c_keycode() {
        assert_eq!(virtual_key(Key::C), 0x08);
    }
}
