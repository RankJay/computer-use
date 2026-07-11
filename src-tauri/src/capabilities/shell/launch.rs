use std::collections::HashMap;
use std::process::Stdio;

use serde::Serialize;

use crate::capabilities::error::{CommandError, ErrorCode};

use super::common::resolve_cwd;
use super::resolver::{resolver, ExecutableResolver, ResolvedExecutable};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub pid: u32,
    pub exe: String,
}

#[tauri::command]
pub fn launch(
    exe: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<LaunchResult, CommandError> {
    launch_with(resolver(), exe, args, cwd, env)
}

fn launch_with(
    resolver: &dyn ExecutableResolver,
    exe: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<LaunchResult, CommandError> {
    let exe = exe.trim().to_string();
    if exe.is_empty() {
        return Err(CommandError::new(
            ErrorCode::InvalidExe,
            "Executable must not be empty",
        ));
    }

    let ResolvedExecutable { path: resolved } = resolver.resolve(&exe)?;
    let working_dir = resolve_cwd(cwd.as_deref())?;

    let mut command = std::process::Command::new(&resolved);
    command
        .args(args.unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dir) = &working_dir {
        command.current_dir(dir);
    }

    if let Some(env_vars) = env {
        for (key, value) in env_vars {
            command.env(key, value);
        }
    }

    let child = command.spawn().map_err(|error| {
        CommandError::new(
            ErrorCode::SpawnFailed,
            format!("Failed to launch process: {error}"),
        )
    })?;

    Ok(LaunchResult {
        pid: child.id(),
        exe: resolved,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::shell::resolver::fake::FakeResolver;

    #[test]
    fn rejects_empty_exe() {
        let error = launch("  ".to_string(), None, None, None).expect_err("empty exe");
        assert_eq!(error.code, "invalid_exe");
    }

    #[test]
    fn fake_resolver_maps_bare_name() {
        let fake = FakeResolver::new([("notepad", r"C:\Windows\System32\notepad.exe")]);
        let resolved = fake.resolve("notepad").expect("resolve");
        assert_eq!(resolved.path, r"C:\Windows\System32\notepad.exe");
    }

    #[test]
    fn fake_resolver_passes_through_paths() {
        let fake = FakeResolver::new([("ignored", "/nowhere")]);
        assert_eq!(
            fake.resolve(r"C:\Tools\app.exe").expect("resolve").path,
            r"C:\Tools\app.exe"
        );
        assert_eq!(
            fake.resolve("./local-tool").expect("resolve").path,
            "./local-tool"
        );
    }

    #[test]
    fn launch_with_fake_uses_resolved_path_on_spawn_error() {
        // Non-existent path: spawn fails, but error confirms resolution went through the fake.
        let fake = FakeResolver::new([("myapp", r"C:\definitely\missing\myapp.exe")]);
        let err = launch_with(&fake, "myapp".into(), None, None, None).expect_err("spawn");
        assert_eq!(err.code, "spawn_failed");
    }
}
