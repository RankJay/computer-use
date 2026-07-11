use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextResult {
    pub text: String,
    pub generation: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visited: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emitted: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncation_reason: Option<String>,
}

impl TextResult {
    pub fn plain(text: String, generation: Option<u32>) -> Self {
        Self {
            text,
            generation,
            visited: None,
            emitted: None,
            truncated: None,
            truncation_reason: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub ok: bool,
    pub method: String,
    pub foregrounded: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetValueResult {
    pub value: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    pub method: String,
}

#[derive(Debug, Deserialize)]
pub struct SnapshotInput {
    pub hwnd: i64,
    #[serde(default = "default_max_depth")]
    pub max_depth: u32,
    #[serde(default = "default_max_elements")]
    pub max_elements: u32,
}

impl SnapshotInput {
    pub fn clamped(mut self) -> Self {
        self.max_depth = self.max_depth.clamp(1, 20);
        self.max_elements = self.max_elements.clamp(1, 300);
        self
    }
}

#[derive(Debug, Deserialize)]
pub struct FindElementInput {
    pub hwnd: i64,
    pub name_contains: String,
    pub role: Option<String>,
    #[serde(default)]
    #[allow(dead_code)] // encoded into the worker job deadline by commands
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

pub const TIMEOUT_SNAPSHOT_MS: u64 = 4_000;
pub const TIMEOUT_SNAPSHOT_FIRST_TOUCH_MS: u64 = 8_000;
pub const TIMEOUT_FIND_MS: u64 = 30_000;
pub const TIMEOUT_EXPAND_MS: u64 = 2_500;
pub const TIMEOUT_ACTION_MS: u64 = 2_000;

pub const DEGRADED_COOLDOWN_MS: u64 = 30_000;
pub const MAX_GENERATIONS_PER_HWND: usize = 2;
