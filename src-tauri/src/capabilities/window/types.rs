use serde::{Deserialize, Serialize};

/// Opaque window identity on the wire as a bare i64 (`windowId` JSON key; `hwnd` accepted as alias).
/// Windows: HWND. macOS: CGWindowID.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WindowId(pub i64);

impl std::fmt::Display for WindowId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowListResult {
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowActionResult {
    pub ok: bool,
    #[serde(rename = "windowId", alias = "hwnd")]
    pub id: WindowId,
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
    #[serde(rename = "windowId", alias = "hwnd")]
    pub id: WindowId,
    pub op: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowMoveResult {
    pub ok: bool,
    #[serde(rename = "windowId", alias = "hwnd")]
    pub id: WindowId,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowResizeResult {
    pub ok: bool,
    #[serde(rename = "windowId", alias = "hwnd")]
    pub id: WindowId,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowResult {
    #[serde(rename = "windowId", alias = "hwnd")]
    pub id: WindowId,
    pub title: Option<String>,
    pub process_name: Option<String>,
}

/// Outer recv timeout for window listing. Kept above the in-list name-resolve budget.
pub const TIMEOUT_LIST_WINDOWS_MS: u64 = 5_000;
