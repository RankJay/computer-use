use crate::capabilities::error::{CommandError, OkResult};

use super::keys::Key;
use super::types::MouseButton;

/// Platform seam for mouse/keyboard synthesis. Callers use [`super::synthesizer`]; OS details stay in adapters.
pub trait InputSynthesizer: Send + Sync {
    fn mouse_move(&self, x: i32, y: i32) -> Result<OkResult, CommandError>;

    fn mouse_button_down(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError>;

    fn mouse_button_up(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError>;

    fn mouse_click(
        &self,
        button: MouseButton,
        count: u32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError>;

    fn mouse_scroll(
        &self,
        dx: i32,
        dy: i32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError>;

    fn mouse_drag(
        &self,
        x0: i32,
        y0: i32,
        x1: i32,
        y1: i32,
        button: MouseButton,
        steps: u32,
    ) -> Result<OkResult, CommandError>;

    fn mouse_hover(&self, x: i32, y: i32, ms: u64) -> Result<OkResult, CommandError>;

    fn key_down(&self, key: Key) -> Result<OkResult, CommandError>;

    fn key_up(&self, key: Key) -> Result<OkResult, CommandError>;

    fn key_press(&self, key: Key, count: u32) -> Result<OkResult, CommandError>;

    fn hotkey(&self, keys: &[Key]) -> Result<OkResult, CommandError>;
}
