use crate::capabilities::error::{CommandError, OkResult};

use super::keys::{parse_key, parse_keys};
use super::synthesizer;
use super::types::{require_nonzero_scroll, require_positive_count, MouseButton};

#[tauri::command]
pub fn mouse_move(x: i32, y: i32) -> Result<OkResult, CommandError> {
    synthesizer().mouse_move(x, y)
}

#[tauri::command]
pub fn mouse_click(
    button: String,
    count: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<OkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    let count = count.unwrap_or(1);
    require_positive_count(count, "Click count")?;
    synthesizer().mouse_click(button, count, x, y)
}

#[tauri::command]
pub fn mouse_scroll(
    dx: i32,
    dy: i32,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<OkResult, CommandError> {
    require_nonzero_scroll(dx, dy)?;
    synthesizer().mouse_scroll(dx, dy, x, y)
}

#[tauri::command]
pub fn mouse_drag(
    x0: i32,
    y0: i32,
    x1: i32,
    y1: i32,
    button: Option<String>,
    steps: Option<u32>,
) -> Result<OkResult, CommandError> {
    let button = match button {
        Some(value) => MouseButton::parse(&value)?,
        None => MouseButton::Left,
    };
    let steps = steps.unwrap_or(12);
    synthesizer().mouse_drag(x0, y0, x1, y1, button, steps)
}

#[tauri::command]
pub fn mouse_hover(x: i32, y: i32, ms: Option<u64>) -> Result<OkResult, CommandError> {
    synthesizer().mouse_hover(x, y, ms.unwrap_or(200))
}

#[tauri::command]
pub fn mouse_down(
    button: String,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<OkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    synthesizer().mouse_button_down(button, x, y)
}

#[tauri::command]
pub fn mouse_up(button: String, x: Option<i32>, y: Option<i32>) -> Result<OkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    synthesizer().mouse_button_up(button, x, y)
}

#[tauri::command]
pub fn hotkey(keys: Vec<String>) -> Result<OkResult, CommandError> {
    let keys = parse_keys(&keys)?;
    synthesizer().hotkey(&keys)
}

#[tauri::command]
pub fn key_down(key: String) -> Result<OkResult, CommandError> {
    let key = parse_key(&key)?;
    synthesizer().key_down(key)
}

#[tauri::command]
pub fn key_up(key: String) -> Result<OkResult, CommandError> {
    let key = parse_key(&key)?;
    synthesizer().key_up(key)
}

#[tauri::command]
pub fn key_press(key: String, count: Option<u32>) -> Result<OkResult, CommandError> {
    let key = parse_key(&key)?;
    let count = count.unwrap_or(1);
    require_positive_count(count, "Key press count")?;
    synthesizer().key_press(key, count)
}

#[cfg(test)]
mod tests {
    use super::super::keys::Key;
    use super::super::recording::{RecordedEvent, RecordingSynthesizer};
    use super::super::synthesizer::InputSynthesizer;
    use super::super::types::MouseButton;
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
        let error = require_positive_count(0, "Click count").expect_err("zero");
        assert_eq!(error.code, "invalid_count");
    }

    #[test]
    fn key_press_rejects_zero_count() {
        let error = require_positive_count(0, "Key press count").expect_err("zero");
        assert_eq!(error.code, "invalid_count");
    }

    #[test]
    fn recording_mouse_click_records_each_click() {
        let synth = RecordingSynthesizer::new();
        synth
            .mouse_click(MouseButton::Left, 2, Some(10), Some(20))
            .expect("click");
        assert_eq!(
            synth.events(),
            vec![
                RecordedEvent::MouseClick {
                    button: MouseButton::Left,
                    x: Some(10),
                    y: Some(20),
                },
                RecordedEvent::MouseClick {
                    button: MouseButton::Left,
                    x: Some(10),
                    y: Some(20),
                },
            ]
        );
    }

    #[test]
    fn recording_hotkey_records_down_down_up_up() {
        let synth = RecordingSynthesizer::new();
        synth.hotkey(&[Key::Ctrl, Key::C]).expect("hotkey");
        assert_eq!(
            synth.events(),
            vec![
                RecordedEvent::KeyDown(Key::Ctrl),
                RecordedEvent::KeyDown(Key::C),
                RecordedEvent::KeyUp(Key::C),
                RecordedEvent::KeyUp(Key::Ctrl),
            ]
        );
    }
}
