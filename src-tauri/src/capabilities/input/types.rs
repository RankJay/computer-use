use crate::capabilities::error::{CommandError, ErrorCode};

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

/// Portable validation shared by commands (identical on every platform).
pub fn require_positive_count(count: u32, what: &str) -> Result<(), CommandError> {
    if count == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidCount,
            format!("{what} must be at least 1"),
        ));
    }
    Ok(())
}

pub fn require_nonzero_scroll(dx: i32, dy: i32) -> Result<(), CommandError> {
    if dx == 0 && dy == 0 {
        return Err(CommandError::new(
            ErrorCode::InvalidScroll,
            "At least one of dx or dy must be non-zero",
        ));
    }
    Ok(())
}
