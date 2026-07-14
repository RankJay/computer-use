//! Launch Services app launch via `NSWorkspace.openApplicationAtURL:`.

use std::collections::HashMap;
use std::time::Duration;

use block2::RcBlock;
use objc2_app_kit::{NSRunningApplication, NSWorkspace, NSWorkspaceOpenConfiguration};
use objc2_foundation::{NSArray, NSDictionary, NSError, NSString, NSURL};

use crate::capabilities::error::{CommandError, ErrorCode};

const LAUNCH_TIMEOUT_MS: u64 = 10_000;

pub(super) fn open_app_bundle(
    bundle: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<u32, CommandError> {
    let url = NSURL::fileURLWithPath(&NSString::from_str(bundle));
    let config = NSWorkspaceOpenConfiguration::configuration();
    // createsNewApplicationInstance stays false: activate the running instance if any.
    if !args.is_empty() {
        config.setArguments(&ns_string_array(args));
    }
    if !env.is_empty() {
        config.setEnvironment(&ns_string_dict(env));
    }

    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<i32, String>>(1);
    let block = RcBlock::new(move |app: *mut NSRunningApplication, error: *mut NSError| {
        // Completion runs on an AppKit concurrent queue; raw pointers need null-checks.
        let result = match unsafe { app.as_ref() } {
            Some(app) => Ok(app.processIdentifier()),
            None => Err(unsafe { error.as_ref() }
                .map(|e| e.localizedDescription().to_string())
                .unwrap_or_else(|| "launch failed with no error".into())),
        };
        let _ = tx.try_send(result);
    });

    NSWorkspace::sharedWorkspace().openApplicationAtURL_configuration_completionHandler(
        &url,
        &config,
        Some(&block),
    );

    match rx.recv_timeout(Duration::from_millis(LAUNCH_TIMEOUT_MS)) {
        Ok(Ok(pid)) if pid >= 0 => Ok(pid as u32),
        Ok(Ok(_)) => Err(CommandError::new(
            ErrorCode::SpawnFailed,
            "Launched app reported no pid",
        )),
        Ok(Err(msg)) => Err(CommandError::new(
            ErrorCode::SpawnFailed,
            format!("Failed to launch app: {msg}"),
        )),
        Err(_) => Err(CommandError::new(
            ErrorCode::SpawnFailed,
            "App launch did not complete within 10s",
        )),
    }
}

fn ns_string_array(args: &[String]) -> objc2::rc::Retained<NSArray<NSString>> {
    let retained: Vec<_> = args.iter().map(|s| NSString::from_str(s)).collect();
    NSArray::from_retained_slice(&retained)
}

fn ns_string_dict(
    env: &HashMap<String, String>,
) -> objc2::rc::Retained<NSDictionary<NSString, NSString>> {
    let (keys, values): (Vec<_>, Vec<_>) = env
        .iter()
        .map(|(k, v)| (NSString::from_str(k), NSString::from_str(v)))
        .unzip();
    let key_refs: Vec<&NSString> = keys.iter().map(|k| k.as_ref()).collect();
    NSDictionary::from_retained_objects(&key_refs, &values)
}
