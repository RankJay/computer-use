use crate::capabilities::error::CommandError;

use super::types::{
    ActiveWindowResult, WindowActionResult, WindowId, WindowListResult, WindowMoveResult,
    WindowResizeResult, WindowStateOp, WindowStateResult,
};

/// Platform seam for window management. Callers use [`super::manager`]; OS details stay in adapters.
pub trait WindowManager: Send + Sync {
    fn list(&self) -> Result<WindowListResult, CommandError>;
    fn focus(&self, id: WindowId) -> Result<WindowActionResult, CommandError>;
    fn move_window(&self, id: WindowId, x: i32, y: i32) -> Result<WindowMoveResult, CommandError>;
    fn resize(
        &self,
        id: WindowId,
        width: i32,
        height: i32,
    ) -> Result<WindowResizeResult, CommandError>;
    fn set_state(&self, id: WindowId, op: WindowStateOp)
        -> Result<WindowStateResult, CommandError>;
    fn active(&self) -> Result<ActiveWindowResult, CommandError>;
}
