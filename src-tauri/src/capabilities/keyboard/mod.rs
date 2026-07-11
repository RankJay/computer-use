use crate::capabilities::error::{CommandError, OkResult};
use crate::capabilities::input::{
    hotkey as input_hotkey, key_down as input_key_down, key_press as input_key_press,
    key_up as input_key_up,
};

fn ok() -> OkResult {
    OkResult { ok: true }
}

#[tauri::command]
pub fn hotkey(keys: Vec<String>) -> Result<OkResult, CommandError> {
    input_hotkey(&keys)?;
    Ok(ok())
}

#[tauri::command]
pub fn key_down(key: String) -> Result<OkResult, CommandError> {
    input_key_down(&key)?;
    Ok(ok())
}

#[tauri::command]
pub fn key_up(key: String) -> Result<OkResult, CommandError> {
    input_key_up(&key)?;
    Ok(ok())
}

#[tauri::command]
pub fn key_press(key: String, count: Option<u32>) -> Result<OkResult, CommandError> {
    input_key_press(&key, count.unwrap_or(1))?;
    Ok(ok())
}
