use crate::capabilities::error::{unsupported_platform, CommandError};

use super::manager::WindowManager;
use super::types::{
    ActiveWindowResult, WindowActionResult, WindowId, WindowListResult, WindowMoveResult,
    WindowResizeResult, WindowStateOp, WindowStateResult,
};

pub struct UnsupportedWindowManager;

impl WindowManager for UnsupportedWindowManager {
    fn list(&self) -> Result<WindowListResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }

    fn focus(&self, _id: WindowId) -> Result<WindowActionResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }

    fn move_window(
        &self,
        _id: WindowId,
        _x: i32,
        _y: i32,
    ) -> Result<WindowMoveResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }

    fn resize(
        &self,
        _id: WindowId,
        _width: i32,
        _height: i32,
    ) -> Result<WindowResizeResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }

    fn set_state(
        &self,
        _id: WindowId,
        _op: WindowStateOp,
    ) -> Result<WindowStateResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }

    fn active(&self) -> Result<ActiveWindowResult, CommandError> {
        Err(unsupported_platform("Window management"))
    }
}
