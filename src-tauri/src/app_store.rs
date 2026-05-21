use crate::app_paths::{session_dir, sessions_dir, settings_path};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunBudget {
    pub max_steps: u32,
    pub max_cost_usd: f64,
    pub max_wall_clock_ms: u32,
}

impl Default for RunBudget {
    fn default() -> Self {
        Self {
            max_steps: 28,
            max_cost_usd: 1.0,
            max_wall_clock_ms: 10 * 60 * 1000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub workspace_root: Option<String>,
    pub permission_mode: String,
    #[serde(default = "default_retention")]
    pub retention_days: u32,
    #[serde(default = "default_anthropic_model", alias = "modelId")]
    pub anthropic_model_id: String,
    #[serde(default = "default_openai_model")]
    pub openai_model_id: String,
    #[serde(default = "default_active_api_provider")]
    pub active_api_provider: String,
    #[serde(default = "default_agent_mode")]
    pub agent_mode: String,
    #[serde(default)]
    pub persisted_approvals: Vec<String>,
    #[serde(default)]
    pub ui_automation_enabled: bool,
    #[serde(default)]
    pub run_budget_defaults: RunBudget,
}

fn default_retention() -> u32 {
    30
}

fn default_anthropic_model() -> String {
    "claude-sonnet-4-6".to_string()
}

fn default_openai_model() -> String {
    "gpt-5.2".to_string()
}

fn default_active_api_provider() -> String {
    "anthropic".to_string()
}

fn default_agent_mode() -> String {
    "live".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            workspace_root: None,
            permission_mode: "ask_risky".into(),
            retention_days: default_retention(),
            anthropic_model_id: default_anthropic_model(),
            openai_model_id: default_openai_model(),
            active_api_provider: default_active_api_provider(),
            agent_mode: default_agent_mode(),
            persisted_approvals: Vec::new(),
            ui_automation_enabled: false,
            run_budget_defaults: RunBudget::default(),
        }
    }
}

fn keyring_entry(key: &str) -> Result<Entry, String> {
    Entry::new("actuate", key).map_err(|e| format!("keyring entry: {e}"))
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    parse_settings(&raw)
}

fn parse_settings(raw: &str) -> Result<AppSettings, String> {
    let mut s: AppSettings = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if s.anthropic_model_id.is_empty() {
        s.anthropic_model_id = default_anthropic_model();
    }
    if s.openai_model_id.is_empty() {
        s.openai_model_id = default_openai_model();
    }
    if s.active_api_provider.is_empty() {
        s.active_api_provider = default_active_api_provider();
    }
    if s.permission_mode.is_empty() {
        s.permission_mode = "ask_risky".into();
    }
    if s.agent_mode.is_empty() {
        s.agent_mode = default_agent_mode();
    }
    Ok(s)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())?;
    prune_old_sessions(&app, settings.retention_days)?;
    Ok(())
}

#[tauri::command]
pub fn load_secret(_app: AppHandle, key: String) -> Result<Option<String>, String> {
    if key.trim().is_empty() {
        return Err("secret key must not be empty".into());
    }
    let entry = keyring_entry(&key)?;
    load_secret_from_entry(&entry)
}

fn load_secret_from_entry(entry: &Entry) -> Result<Option<String>, String> {
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read: {e}")),
    }
}

#[tauri::command]
pub fn store_secret(_app: AppHandle, key: String, value: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("secret key must not be empty".into());
    }
    let entry = keyring_entry(&key)?;
    store_secret_in_entry(&entry, &value)
}

fn store_secret_in_entry(entry: &Entry, value: &str) -> Result<(), String> {
    entry
        .set_password(value)
        .map_err(|e| format!("keyring write: {e}"))
}

#[tauri::command]
pub fn delete_secret(_app: AppHandle, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("secret key must not be empty".into());
    }
    let entry = keyring_entry(&key)?;
    delete_secret_from_entry(&entry)
}

fn delete_secret_from_entry(entry: &Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keyring delete: {e}")),
    }
}

#[tauri::command]
pub fn append_session_log(app: AppHandle, session_id: String, line: String) -> Result<(), String> {
    let dir = session_dir(&app, &session_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("events.jsonl");
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{line}").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn write_session_keyframe(
    app: AppHandle,
    session_id: String,
    filename: String,
    png_base64: String,
) -> Result<String, String> {
    let safe_name = sanitize_keyframe_filename(&filename)?;
    let dir = session_dir(&app, &session_id)?.join("keyframes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&safe_name);
    let bytes = STANDARD
        .decode(png_base64.trim())
        .map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn clear_all_logs(app: AppHandle) -> Result<(), String> {
    let root = sessions_dir(&app)?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let root = crate::app_paths::logs_root(&app)?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&root)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&root)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&root)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sanitize_keyframe_filename(filename: &str) -> Result<String, String> {
    let safe_name: String = filename
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect();
    if safe_name.is_empty() {
        return Err("invalid filename".into());
    }
    Ok(safe_name)
}

fn prune_old_sessions(app: &AppHandle, retention_days: u32) -> Result<(), String> {
    let root = sessions_dir(app)?;
    prune_old_sessions_at(&root, retention_days)
}

fn prune_old_sessions_at(root: &std::path::Path, retention_days: u32) -> Result<(), String> {
    if !root.exists() || retention_days == 0 {
        return Ok(());
    }
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    prune_old_sessions_at_with_now(root, retention_days, now_secs)
}

fn prune_old_sessions_at_with_now(
    root: &std::path::Path,
    retention_days: u32,
    now_secs: u64,
) -> Result<(), String> {
    let cutoff = session_retention_cutoff(now_secs, retention_days);

    let entries = fs::read_dir(root).map_err(|e| e.to_string())?;
    for ent in entries.flatten() {
        let path = ent.path();
        let Ok(meta) = ent.metadata() else {
            continue;
        };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if is_session_dir_stale(modified, cutoff) {
            let _ = fs::remove_dir_all(&path);
        }
    }
    Ok(())
}

fn session_retention_cutoff(now_secs: u64, retention_days: u32) -> u64 {
    now_secs.saturating_sub(retention_days as u64 * 86400)
}

fn is_session_dir_stale(modified_secs: u64, cutoff_secs: u64) -> bool {
    modified_secs < cutoff_secs
}

#[cfg(test)]
mod tests {
    use super::{
        default_anthropic_model, delete_secret_from_entry, is_session_dir_stale,
        load_secret_from_entry, parse_settings, prune_old_sessions_at,
        prune_old_sessions_at_with_now, sanitize_keyframe_filename, session_retention_cutoff,
        store_secret_in_entry, AppSettings,
    };
    use keyring::Entry;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn app_settings_serializes_camel_case() {
        let settings = AppSettings::default();
        let json = serde_json::to_value(&settings).expect("serialize settings");

        assert_eq!(json["permissionMode"], "ask_risky");
        assert_eq!(json["retentionDays"], 30);
        assert_eq!(json["anthropicModelId"], default_anthropic_model());
        assert_eq!(json["activeApiProvider"], "anthropic");
        assert_eq!(json["uiAutomationEnabled"], false);
        assert_eq!(json["runBudgetDefaults"]["maxSteps"], 28);
    }

    #[test]
    fn app_settings_deserializes_legacy_model_id_alias() {
        let raw = r#"{
            "workspaceRoot": null,
            "permissionMode": "ask_all",
            "retentionDays": 7,
            "modelId": "claude-sonnet-4-6",
            "agentMode": "demo",
            "persistedApprovals": [],
            "uiAutomationEnabled": true
        }"#;

        let settings = parse_settings(raw).expect("deserialize legacy settings");

        assert_eq!(settings.anthropic_model_id, "claude-sonnet-4-6");
        assert_eq!(settings.openai_model_id, "gpt-5.2");
        assert_eq!(settings.active_api_provider, "anthropic");
        assert_eq!(settings.permission_mode, "ask_all");
        assert_eq!(settings.retention_days, 7);
        assert!(settings.ui_automation_enabled);
        assert_eq!(settings.run_budget_defaults.max_steps, 28);
    }

    #[test]
    fn sanitize_keyframe_filename_strips_unsafe_chars() {
        let safe = sanitize_keyframe_filename("shot-01_final.png").expect("sanitize filename");

        assert_eq!(safe, "shot-01_final.png");
    }

    #[test]
    fn sanitize_keyframe_filename_rejects_empty_after_strip() {
        let result = sanitize_keyframe_filename("!!!");

        assert!(result.is_err());
    }

    #[test]
    fn session_retention_cutoff_subtracts_days_in_seconds() {
        let now = 10_000_000_u64;

        assert_eq!(session_retention_cutoff(now, 30), now - 30 * 86400);
        assert_eq!(session_retention_cutoff(now, 0), now);
    }

    #[test]
    fn is_session_dir_stale_compares_modified_time_to_cutoff() {
        assert!(is_session_dir_stale(100, 200));
        assert!(!is_session_dir_stale(200, 200));
        assert!(!is_session_dir_stale(300, 200));
    }

    fn temp_sessions_root() -> PathBuf {
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("actuate-store-test-{id}"));
        fs::create_dir_all(&path).expect("create temp sessions root");
        path
    }

    #[test]
    fn prune_old_sessions_keeps_all_when_retention_is_zero() {
        let root = temp_sessions_root();
        let stale = root.join("old");
        fs::create_dir_all(&stale).expect("create stale dir");

        prune_old_sessions_at(&root, 0).expect("skip prune");

        assert!(stale.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prune_old_sessions_removes_dirs_older_than_retention_cutoff() {
        let root = temp_sessions_root();
        let stale = root.join("old");
        fs::create_dir_all(&stale).expect("create stale dir");

        let stale_modified = fs::metadata(&stale)
            .expect("read stale metadata")
            .modified()
            .expect("read stale modified time")
            .duration_since(UNIX_EPOCH)
            .expect("stale modified after epoch")
            .as_secs();
        let simulated_now = stale_modified + 2 * 86400;

        prune_old_sessions_at_with_now(&root, 1, simulated_now).expect("prune old sessions");

        assert!(!stale.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn keyring_entry_helpers_round_trip_with_mock_entry() {
        let entry = Entry::new_with_credential(
            keyring::mock::default_credential_builder()
                .build(None, "actuate-test", "api-key")
                .expect("build mock keyring credential"),
        );

        assert_eq!(
            load_secret_from_entry(&entry).expect("load empty secret"),
            None
        );

        store_secret_in_entry(&entry, "sk-test").expect("store secret");

        assert_eq!(
            load_secret_from_entry(&entry).expect("load stored secret"),
            Some("sk-test".to_string())
        );

        delete_secret_from_entry(&entry).expect("delete secret");

        assert_eq!(
            load_secret_from_entry(&entry).expect("load deleted secret"),
            None
        );
    }
}
