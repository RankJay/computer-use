use crate::capabilities::error::{unsupported_platform, CommandError, OkResult};

use super::keys::Key;
use super::synthesizer::InputSynthesizer;
use super::types::MouseButton;

pub struct UnsupportedInputSynthesizer;

impl InputSynthesizer for UnsupportedInputSynthesizer {
    fn mouse_move(&self, _x: i32, _y: i32) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_button_down(
        &self,
        _button: MouseButton,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_button_up(
        &self,
        _button: MouseButton,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_click(
        &self,
        _button: MouseButton,
        _count: u32,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_scroll(
        &self,
        _dx: i32,
        _dy: i32,
        _x: Option<i32>,
        _y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_drag(
        &self,
        _x0: i32,
        _y0: i32,
        _x1: i32,
        _y1: i32,
        _button: MouseButton,
        _steps: u32,
    ) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn mouse_hover(&self, _x: i32, _y: i32, _ms: u64) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn key_down(&self, _key: Key) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn key_up(&self, _key: Key) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn key_press(&self, _key: Key, _count: u32) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn hotkey(&self, _keys: &[Key]) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }

    fn type_text(&self, _text: &str) -> Result<OkResult, CommandError> {
        Err(unsupported_platform("Mouse and keyboard input"))
    }
}
