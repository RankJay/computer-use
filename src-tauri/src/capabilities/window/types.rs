use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowListResult {
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowActionResult {
    pub ok: bool,
    pub hwnd: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowStateOp {
    Minimize,
    Maximize,
    Restore,
    Close,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStateResult {
    pub ok: bool,
    pub hwnd: i64,
    pub op: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowMoveResult {
    pub ok: bool,
    pub hwnd: i64,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowResizeResult {
    pub ok: bool,
    pub hwnd: i64,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowResult {
    pub hwnd: i64,
    pub title: Option<String>,
    pub process_name: Option<String>,
}

pub const TIMEOUT_LIST_WINDOWS_MS: u64 = 1_500;
