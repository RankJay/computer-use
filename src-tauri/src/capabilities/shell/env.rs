use std::env;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEnvResult {
    pub name: String,
    pub value: Option<String>,
    pub set: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEnvResult {
    pub name: String,
    pub set: bool,
}

#[tauri::command]
pub fn get_env(name: String) -> Result<GetEnvResult, CommandError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidName,
            "Environment variable name must not be empty",
        ));
    }

    match env::var(&name) {
        Ok(value) => Ok(GetEnvResult {
            name,
            value: Some(value),
            set: true,
        }),
        Err(env::VarError::NotPresent) => Ok(GetEnvResult {
            name,
            value: None,
            set: false,
        }),
        Err(error) => Err(CommandError::new(
            ErrorCode::GetEnvFailed,
            format!("Failed to read environment variable: {error}"),
        )),
    }
}

#[tauri::command]
pub fn set_env(name: String, value: String) -> Result<SetEnvResult, CommandError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidName,
            "Environment variable name must not be empty",
        ));
    }

    unsafe {
        env::set_var(&name, value);
    }

    Ok(SetEnvResult { name, set: true })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_env_name_on_get() {
        let error = get_env(" ".to_string()).expect_err("empty name");
        assert_eq!(error.code, "invalid_name");
    }

    #[test]
    fn set_and_get_round_trip() {
        let key = "ACTUATE_TEST_ENV_VAR";
        set_env(key.to_string(), "hello".to_string()).expect("set should succeed");
        let result = get_env(key.to_string()).expect("get should succeed");
        assert!(result.set);
        assert_eq!(result.value.as_deref(), Some("hello"));
    }
}
