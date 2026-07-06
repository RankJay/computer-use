use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct TextResult {
    pub text: String,
    pub generation: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActionResult {
    pub ok: bool,
    pub method: String,
    pub foregrounded: bool,
}

#[derive(Debug, Deserialize)]
pub struct SnapshotInput {
    pub hwnd: i64,
    #[serde(default = "default_max_depth")]
    pub max_depth: u32,
    #[serde(default = "default_max_elements")]
    pub max_elements: u32,
}

#[derive(Debug, Deserialize)]
pub struct FindElementInput {
    pub hwnd: i64,
    pub name_contains: String,
    pub role: Option<String>,
    #[serde(default)]
    pub wait_ms: u64,
}

fn default_max_depth() -> u32 {
    10
}

fn default_max_elements() -> u32 {
    150
}

pub const MAX_WAIT_MS: u64 = 30_000;
pub const WAIT_POLL_MS: u64 = 200;
pub const MAX_FIND_CANDIDATES: usize = 5;

pub const TIMEOUT_LIST_WINDOWS_MS: u64 = 1_500;
pub const TIMEOUT_SNAPSHOT_MS: u64 = 4_000;
pub const TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS: u64 = 8_000;
pub const TIMEOUT_FIND_MS: u64 = 30_000;
pub const TIMEOUT_EXPAND_MS: u64 = 2_500;
pub const TIMEOUT_ACTION_MS: u64 = 2_000;

pub const DEGRADED_COOLDOWN_MS: u64 = 30_000;
pub const MAX_GENERATIONS_PER_HWND: usize = 2;
