use serde::Serialize;

use crate::capabilities::input::{
    mouse_button_down as input_down, mouse_button_up as input_up, mouse_click as input_click,
    mouse_drag as input_drag, mouse_hover as input_hover, mouse_move as input_move,
    mouse_scroll as input_scroll, MouseButton,
};
use crate::capabilities::path_utils::CommandError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseOkResult {
    pub ok: bool,
}

fn ok() -> MouseOkResult {
    MouseOkResult { ok: true }
}

#[tauri::command]
pub fn mouse_move(x: i32, y: i32) -> Result<MouseOkResult, CommandError> {
    input_move(x, y)?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_click(
    button: String,
    count: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<MouseOkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    let count = count.unwrap_or(1);
    input_click(button, count, x, y)?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_scroll(
    dx: i32,
    dy: i32,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<MouseOkResult, CommandError> {
    input_scroll(dx, dy, x, y)?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_drag(
    x0: i32,
    y0: i32,
    x1: i32,
    y1: i32,
    button: Option<String>,
    steps: Option<u32>,
) -> Result<MouseOkResult, CommandError> {
    let button = match button {
        Some(value) => MouseButton::parse(&value)?,
        None => MouseButton::Left,
    };
    let steps = steps.unwrap_or(12);
    input_drag(x0, y0, x1, y1, button, steps)?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_hover(x: i32, y: i32, ms: Option<u64>) -> Result<MouseOkResult, CommandError> {
    input_hover(x, y, ms.unwrap_or(200))?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_down(
    button: String,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<MouseOkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    input_down(button, x, y)?;
    Ok(ok())
}

#[tauri::command]
pub fn mouse_up(
    button: String,
    x: Option<i32>,
    y: Option<i32>,
) -> Result<MouseOkResult, CommandError> {
    let button = MouseButton::parse(&button)?;
    input_up(button, x, y)?;
    Ok(ok())
}
