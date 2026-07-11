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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTextResult {
    pub text: String,
    pub method: String,
}

#[derive(Debug, Deserialize)]
pub struct SnapshotInput {
    pub hwnd: Option<i64>,
    pub reference: Option<String>,
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

/// Soft cap on outline text size (chars). Hard caps remain max_elements / max_depth.
pub const MAX_OUTLINE_CHARS: usize = 12_000;
/// Emit this many consecutive identical siblings before compressing the rest.
pub const SIBLING_FINGERPRINT_EMIT: u32 = 3;

#[derive(Debug, Deserialize)]
pub struct FindElementInput {
    pub hwnd: i64,
    pub name_contains: String,
    pub role: Option<String>,
    #[serde(default)]
    #[allow(dead_code)] // encoded into the worker job deadline by commands
    pub wait_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct QueryInput {
    pub hwnd: i64,
    pub name: Option<String>,
    pub name_contains: Option<String>,
    pub automation_id: Option<String>,
    pub role: Option<String>,
    pub enabled: Option<bool>,
    pub visible: Option<bool>,
    pub limit: Option<u32>,
    #[serde(default)]
    pub wait_ms: u64,
    pub scope_reference: Option<String>,
}

impl QueryInput {
    pub fn clamped(mut self) -> Self {
        if let Some(limit) = self.limit {
            self.limit = Some(limit.clamp(1, 20));
        }
        self.wait_ms = self.wait_ms.min(MAX_WAIT_MS);
        self
    }

    pub fn from_find(input: FindElementInput) -> Self {
        Self {
            hwnd: input.hwnd,
            name: None,
            name_contains: Some(input.name_contains),
            automation_id: None,
            role: input.role,
            enabled: None,
            visible: None,
            limit: Some(MAX_FIND_CANDIDATES as u32),
            wait_ms: input.wait_ms,
            scope_reference: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectResult {
    pub text: String,
    pub name: String,
    pub role: Option<String>,
    pub automation_id: String,
    pub runtime_id: Vec<i32>,
    pub enabled: bool,
    pub offscreen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rect: Option<(i32, i32, i32, i32)>,
    pub patterns: Vec<String>,
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
