//! App-wide command error types and shared result DTOs.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    A11yBusy,
    AccessibilityPermissionDenied,
    ActionUnavailable,
    AlreadyExists,
    AmbiguousProcessName,
    AmbiguousReference,
    CaptureFailed,
    CaptureUnavailable,
    ClickFailed,
    ClickTimeout,
    ClipboardImageEncodeFailed,
    ClipboardImageInvalid,
    ClipboardImageTooLarge,
    ClipboardReadFailed,
    ClipboardUnavailable,
    ClipboardWriteFailed,
    CloseFailed,
    CreateFailed,
    CursorMoveFailed,
    DeadlineExceeded,
    DeleteFailed,
    DestExists,
    DuplicateFailed,
    ElementAtPointFailed,
    ElementAtPointTimeout,
    ElevationRequired,
    FileTooLarge,
    FindElementTimeout,
    FindFailed,
    FocusDenied,
    FocusFailed,
    FocusMismatch,
    FocusTimeout,
    GetEnvFailed,
    GetFocusedFailed,
    GetFocusedTimeout,
    GetSelectionFailed,
    GetSelectionTimeout,
    GetTextFailed,
    GetTextTimeout,
    GetValueFailed,
    GetValueTimeout,
    InspectFailed,
    InspectTimeout,
    InvalidButton,
    InvalidCoordinates,
    InvalidCount,
    InvalidCwd,
    InvalidDuration,
    InvalidExe,
    InvalidGlob,
    InvalidHwnd,
    InvalidInput,
    InvalidKey,
    InvalidKeys,
    InvalidName,
    InvalidPath,
    InvalidPid,
    InvalidProgram,
    InvalidReference,
    InvalidScroll,
    InvalidSize,
    InvokeActionFailed,
    InvokeActionTimeout,
    IoError,
    KillFailed,
    ListWindowsTimeout,
    MoveFailed,
    NoActiveWindow,
    NotADirectory,
    NotAFile,
    NotFound,
    NotifyFailed,
    OpenFailed,
    OsPermissionDenied,
    ParentMissing,
    PatchApplyFailed,
    PatchInvalidDiff,
    PathTraversal,
    PointMismatch,
    ProcessEnumFailed,
    ProcessInfoFailed,
    ProcessNotFound,
    QueryTimeout,
    ReadFailed,
    ReadOutputFailed,
    ResizeFailed,
    ResolveFailed,
    RightClickFailed,
    RightClickTimeout,
    ScrollElementTimeout,
    ScrollFailed,
    ScrollUnavailable,
    SelectionUnavailable,
    SendInputFailed,
    SendKeysFailed,
    SendKeysTimeout,
    SetValueFailed,
    SetValueTimeout,
    SnapshotFailed,
    SnapshotTimeout,
    SpawnFailed,
    StaleReference,
    TargetDegraded,
    TooManyEntries,
    UiaInitFailed,
    /// Emitted from `#[cfg(not(windows))]` stubs; kept so the wire string stays typed.
    #[allow(dead_code)]
    UnsupportedPlatform,
    WaitFailed,
    WaitTimeout,
    WindowEnumFailed,
    WorkerFailed,
    WorkspaceInvalid,
    WorkspaceUnconfigured,
    WriteFailed,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::A11yBusy => "a11y_busy",
            Self::AccessibilityPermissionDenied => "accessibility_permission_denied",
            Self::ActionUnavailable => "action_unavailable",
            Self::AlreadyExists => "already_exists",
            Self::AmbiguousProcessName => "ambiguous_process_name",
            Self::AmbiguousReference => "ambiguous_reference",
            Self::CaptureFailed => "capture_failed",
            Self::CaptureUnavailable => "capture_unavailable",
            Self::ClickFailed => "click_failed",
            Self::ClickTimeout => "click_timeout",
            Self::ClipboardImageEncodeFailed => "clipboard_image_encode_failed",
            Self::ClipboardImageInvalid => "clipboard_image_invalid",
            Self::ClipboardImageTooLarge => "clipboard_image_too_large",
            Self::ClipboardReadFailed => "clipboard_read_failed",
            Self::ClipboardUnavailable => "clipboard_unavailable",
            Self::ClipboardWriteFailed => "clipboard_write_failed",
            Self::CloseFailed => "close_failed",
            Self::CreateFailed => "create_failed",
            Self::CursorMoveFailed => "cursor_move_failed",
            Self::DeadlineExceeded => "deadline_exceeded",
            Self::DeleteFailed => "delete_failed",
            Self::DestExists => "dest_exists",
            Self::DuplicateFailed => "duplicate_failed",
            Self::ElementAtPointFailed => "element_at_point_failed",
            Self::ElementAtPointTimeout => "element_at_point_timeout",
            Self::ElevationRequired => "elevation_required",
            Self::FileTooLarge => "file_too_large",
            Self::FindElementTimeout => "find_element_timeout",
            Self::FindFailed => "find_failed",
            Self::FocusDenied => "focus_denied",
            Self::FocusFailed => "focus_failed",
            Self::FocusMismatch => "focus_mismatch",
            Self::FocusTimeout => "focus_timeout",
            Self::GetEnvFailed => "get_env_failed",
            Self::GetFocusedFailed => "get_focused_failed",
            Self::GetFocusedTimeout => "get_focused_timeout",
            Self::GetSelectionFailed => "get_selection_failed",
            Self::GetSelectionTimeout => "get_selection_timeout",
            Self::GetTextFailed => "get_text_failed",
            Self::GetTextTimeout => "get_text_timeout",
            Self::GetValueFailed => "get_value_failed",
            Self::GetValueTimeout => "get_value_timeout",
            Self::InspectFailed => "inspect_failed",
            Self::InspectTimeout => "inspect_timeout",
            Self::InvalidButton => "invalid_button",
            Self::InvalidCoordinates => "invalid_coordinates",
            Self::InvalidCount => "invalid_count",
            Self::InvalidCwd => "invalid_cwd",
            Self::InvalidDuration => "invalid_duration",
            Self::InvalidExe => "invalid_exe",
            Self::InvalidGlob => "invalid_glob",
            Self::InvalidHwnd => "invalid_hwnd",
            Self::InvalidInput => "invalid_input",
            Self::InvalidKey => "invalid_key",
            Self::InvalidKeys => "invalid_keys",
            Self::InvalidName => "invalid_name",
            Self::InvalidPath => "invalid_path",
            Self::InvalidPid => "invalid_pid",
            Self::InvalidProgram => "invalid_program",
            Self::InvalidReference => "invalid_reference",
            Self::InvalidScroll => "invalid_scroll",
            Self::InvalidSize => "invalid_size",
            Self::InvokeActionFailed => "invoke_action_failed",
            Self::InvokeActionTimeout => "invoke_action_timeout",
            Self::IoError => "io_error",
            Self::KillFailed => "kill_failed",
            Self::ListWindowsTimeout => "list_windows_timeout",
            Self::MoveFailed => "move_failed",
            Self::NoActiveWindow => "no_active_window",
            Self::NotADirectory => "not_a_directory",
            Self::NotAFile => "not_a_file",
            Self::NotFound => "not_found",
            Self::NotifyFailed => "notify_failed",
            Self::OpenFailed => "open_failed",
            Self::OsPermissionDenied => "os_permission_denied",
            Self::ParentMissing => "parent_missing",
            Self::PatchApplyFailed => "patch_apply_failed",
            Self::PatchInvalidDiff => "patch_invalid_diff",
            Self::PathTraversal => "path_traversal",
            Self::PointMismatch => "point_mismatch",
            Self::ProcessEnumFailed => "process_enum_failed",
            Self::ProcessInfoFailed => "process_info_failed",
            Self::ProcessNotFound => "process_not_found",
            Self::QueryTimeout => "query_timeout",
            Self::ReadFailed => "read_failed",
            Self::ReadOutputFailed => "read_output_failed",
            Self::ResizeFailed => "resize_failed",
            Self::ResolveFailed => "resolve_failed",
            Self::RightClickFailed => "right_click_failed",
            Self::RightClickTimeout => "right_click_timeout",
            Self::ScrollElementTimeout => "scroll_element_timeout",
            Self::ScrollFailed => "scroll_failed",
            Self::ScrollUnavailable => "scroll_unavailable",
            Self::SelectionUnavailable => "selection_unavailable",
            Self::SendInputFailed => "send_input_failed",
            Self::SendKeysFailed => "send_keys_failed",
            Self::SendKeysTimeout => "send_keys_timeout",
            Self::SetValueFailed => "set_value_failed",
            Self::SetValueTimeout => "set_value_timeout",
            Self::SnapshotFailed => "snapshot_failed",
            Self::SnapshotTimeout => "snapshot_timeout",
            Self::SpawnFailed => "spawn_failed",
            Self::StaleReference => "stale_reference",
            Self::TargetDegraded => "target_degraded",
            Self::TooManyEntries => "too_many_entries",
            Self::UiaInitFailed => "uia_init_failed",
            Self::UnsupportedPlatform => "unsupported_platform",
            Self::WaitFailed => "wait_failed",
            Self::WaitTimeout => "wait_timeout",
            Self::WindowEnumFailed => "window_enum_failed",
            Self::WorkerFailed => "worker_failed",
            Self::WorkspaceInvalid => "workspace_invalid",
            Self::WorkspaceUnconfigured => "workspace_unconfigured",
            Self::WriteFailed => "write_failed",
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct CommandError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl CommandError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code: code.as_str().to_string(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

/// Shared { ok: true } success DTO for mouse/keyboard/input commands.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

/// Capability-scoped unsupported-platform error; preserves historical message wording.
#[allow(dead_code)] // call sites are behind `cfg(not(windows))`
pub fn unsupported_platform(capability: &str) -> CommandError {
    CommandError::new(
        ErrorCode::UnsupportedPlatform,
        format!("{capability} is only supported on Windows and macOS"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn error_code_as_str_matches_legacy_wire_strings() {
        assert_eq!(ErrorCode::A11yBusy.as_str(), "a11y_busy");
        assert_eq!(
            ErrorCode::AccessibilityPermissionDenied.as_str(),
            "accessibility_permission_denied"
        );
        assert_eq!(ErrorCode::ActionUnavailable.as_str(), "action_unavailable");
        assert_eq!(ErrorCode::AlreadyExists.as_str(), "already_exists");
        assert_eq!(
            ErrorCode::AmbiguousProcessName.as_str(),
            "ambiguous_process_name"
        );
        assert_eq!(
            ErrorCode::AmbiguousReference.as_str(),
            "ambiguous_reference"
        );
        assert_eq!(ErrorCode::CaptureFailed.as_str(), "capture_failed");
        assert_eq!(
            ErrorCode::CaptureUnavailable.as_str(),
            "capture_unavailable"
        );
        assert_eq!(ErrorCode::ClickFailed.as_str(), "click_failed");
        assert_eq!(ErrorCode::ClickTimeout.as_str(), "click_timeout");
        assert_eq!(
            ErrorCode::ClipboardImageEncodeFailed.as_str(),
            "clipboard_image_encode_failed"
        );
        assert_eq!(
            ErrorCode::ClipboardImageInvalid.as_str(),
            "clipboard_image_invalid"
        );
        assert_eq!(
            ErrorCode::ClipboardImageTooLarge.as_str(),
            "clipboard_image_too_large"
        );
        assert_eq!(
            ErrorCode::ClipboardReadFailed.as_str(),
            "clipboard_read_failed"
        );
        assert_eq!(
            ErrorCode::ClipboardUnavailable.as_str(),
            "clipboard_unavailable"
        );
        assert_eq!(
            ErrorCode::ClipboardWriteFailed.as_str(),
            "clipboard_write_failed"
        );
        assert_eq!(ErrorCode::CloseFailed.as_str(), "close_failed");
        assert_eq!(ErrorCode::CreateFailed.as_str(), "create_failed");
        assert_eq!(ErrorCode::CursorMoveFailed.as_str(), "cursor_move_failed");
        assert_eq!(ErrorCode::DeadlineExceeded.as_str(), "deadline_exceeded");
        assert_eq!(ErrorCode::DeleteFailed.as_str(), "delete_failed");
        assert_eq!(ErrorCode::DestExists.as_str(), "dest_exists");
        assert_eq!(ErrorCode::DuplicateFailed.as_str(), "duplicate_failed");
        assert_eq!(
            ErrorCode::ElementAtPointFailed.as_str(),
            "element_at_point_failed"
        );
        assert_eq!(
            ErrorCode::ElementAtPointTimeout.as_str(),
            "element_at_point_timeout"
        );
        assert_eq!(ErrorCode::ElevationRequired.as_str(), "elevation_required");
        assert_eq!(ErrorCode::FileTooLarge.as_str(), "file_too_large");
        assert_eq!(
            ErrorCode::FindElementTimeout.as_str(),
            "find_element_timeout"
        );
        assert_eq!(ErrorCode::FindFailed.as_str(), "find_failed");
        assert_eq!(ErrorCode::FocusDenied.as_str(), "focus_denied");
        assert_eq!(ErrorCode::FocusFailed.as_str(), "focus_failed");
        assert_eq!(ErrorCode::FocusMismatch.as_str(), "focus_mismatch");
        assert_eq!(ErrorCode::FocusTimeout.as_str(), "focus_timeout");
        assert_eq!(ErrorCode::GetEnvFailed.as_str(), "get_env_failed");
        assert_eq!(ErrorCode::GetFocusedFailed.as_str(), "get_focused_failed");
        assert_eq!(ErrorCode::GetFocusedTimeout.as_str(), "get_focused_timeout");
        assert_eq!(
            ErrorCode::GetSelectionFailed.as_str(),
            "get_selection_failed"
        );
        assert_eq!(
            ErrorCode::GetSelectionTimeout.as_str(),
            "get_selection_timeout"
        );
        assert_eq!(ErrorCode::GetTextFailed.as_str(), "get_text_failed");
        assert_eq!(ErrorCode::GetTextTimeout.as_str(), "get_text_timeout");
        assert_eq!(ErrorCode::GetValueFailed.as_str(), "get_value_failed");
        assert_eq!(ErrorCode::GetValueTimeout.as_str(), "get_value_timeout");
        assert_eq!(ErrorCode::InspectFailed.as_str(), "inspect_failed");
        assert_eq!(ErrorCode::InspectTimeout.as_str(), "inspect_timeout");
        assert_eq!(ErrorCode::InvalidButton.as_str(), "invalid_button");
        assert_eq!(
            ErrorCode::InvalidCoordinates.as_str(),
            "invalid_coordinates"
        );
        assert_eq!(ErrorCode::InvalidCount.as_str(), "invalid_count");
        assert_eq!(ErrorCode::InvalidCwd.as_str(), "invalid_cwd");
        assert_eq!(ErrorCode::InvalidDuration.as_str(), "invalid_duration");
        assert_eq!(ErrorCode::InvalidExe.as_str(), "invalid_exe");
        assert_eq!(ErrorCode::InvalidGlob.as_str(), "invalid_glob");
        assert_eq!(ErrorCode::InvalidHwnd.as_str(), "invalid_hwnd");
        assert_eq!(ErrorCode::InvalidInput.as_str(), "invalid_input");
        assert_eq!(ErrorCode::InvalidKey.as_str(), "invalid_key");
        assert_eq!(ErrorCode::InvalidKeys.as_str(), "invalid_keys");
        assert_eq!(ErrorCode::InvalidName.as_str(), "invalid_name");
        assert_eq!(ErrorCode::InvalidPath.as_str(), "invalid_path");
        assert_eq!(ErrorCode::InvalidPid.as_str(), "invalid_pid");
        assert_eq!(ErrorCode::InvalidProgram.as_str(), "invalid_program");
        assert_eq!(ErrorCode::InvalidReference.as_str(), "invalid_reference");
        assert_eq!(ErrorCode::InvalidScroll.as_str(), "invalid_scroll");
        assert_eq!(ErrorCode::InvalidSize.as_str(), "invalid_size");
        assert_eq!(
            ErrorCode::InvokeActionFailed.as_str(),
            "invoke_action_failed"
        );
        assert_eq!(
            ErrorCode::InvokeActionTimeout.as_str(),
            "invoke_action_timeout"
        );
        assert_eq!(ErrorCode::IoError.as_str(), "io_error");
        assert_eq!(ErrorCode::KillFailed.as_str(), "kill_failed");
        assert_eq!(
            ErrorCode::ListWindowsTimeout.as_str(),
            "list_windows_timeout"
        );
        assert_eq!(ErrorCode::MoveFailed.as_str(), "move_failed");
        assert_eq!(ErrorCode::NoActiveWindow.as_str(), "no_active_window");
        assert_eq!(ErrorCode::NotADirectory.as_str(), "not_a_directory");
        assert_eq!(ErrorCode::NotAFile.as_str(), "not_a_file");
        assert_eq!(ErrorCode::NotFound.as_str(), "not_found");
        assert_eq!(ErrorCode::NotifyFailed.as_str(), "notify_failed");
        assert_eq!(ErrorCode::OpenFailed.as_str(), "open_failed");
        assert_eq!(
            ErrorCode::OsPermissionDenied.as_str(),
            "os_permission_denied"
        );
        assert_eq!(ErrorCode::ParentMissing.as_str(), "parent_missing");
        assert_eq!(ErrorCode::PatchApplyFailed.as_str(), "patch_apply_failed");
        assert_eq!(ErrorCode::PatchInvalidDiff.as_str(), "patch_invalid_diff");
        assert_eq!(ErrorCode::PathTraversal.as_str(), "path_traversal");
        assert_eq!(ErrorCode::PointMismatch.as_str(), "point_mismatch");
        assert_eq!(ErrorCode::ProcessEnumFailed.as_str(), "process_enum_failed");
        assert_eq!(ErrorCode::ProcessInfoFailed.as_str(), "process_info_failed");
        assert_eq!(ErrorCode::ProcessNotFound.as_str(), "process_not_found");
        assert_eq!(ErrorCode::QueryTimeout.as_str(), "query_timeout");
        assert_eq!(ErrorCode::ReadFailed.as_str(), "read_failed");
        assert_eq!(ErrorCode::ReadOutputFailed.as_str(), "read_output_failed");
        assert_eq!(ErrorCode::ResizeFailed.as_str(), "resize_failed");
        assert_eq!(ErrorCode::ResolveFailed.as_str(), "resolve_failed");
        assert_eq!(ErrorCode::RightClickFailed.as_str(), "right_click_failed");
        assert_eq!(ErrorCode::RightClickTimeout.as_str(), "right_click_timeout");
        assert_eq!(
            ErrorCode::ScrollElementTimeout.as_str(),
            "scroll_element_timeout"
        );
        assert_eq!(ErrorCode::ScrollFailed.as_str(), "scroll_failed");
        assert_eq!(ErrorCode::ScrollUnavailable.as_str(), "scroll_unavailable");
        assert_eq!(
            ErrorCode::SelectionUnavailable.as_str(),
            "selection_unavailable"
        );
        assert_eq!(ErrorCode::SendInputFailed.as_str(), "send_input_failed");
        assert_eq!(ErrorCode::SendKeysFailed.as_str(), "send_keys_failed");
        assert_eq!(ErrorCode::SendKeysTimeout.as_str(), "send_keys_timeout");
        assert_eq!(ErrorCode::SetValueFailed.as_str(), "set_value_failed");
        assert_eq!(ErrorCode::SetValueTimeout.as_str(), "set_value_timeout");
        assert_eq!(ErrorCode::SnapshotFailed.as_str(), "snapshot_failed");
        assert_eq!(ErrorCode::SnapshotTimeout.as_str(), "snapshot_timeout");
        assert_eq!(ErrorCode::SpawnFailed.as_str(), "spawn_failed");
        assert_eq!(ErrorCode::StaleReference.as_str(), "stale_reference");
        assert_eq!(ErrorCode::TargetDegraded.as_str(), "target_degraded");
        assert_eq!(ErrorCode::TooManyEntries.as_str(), "too_many_entries");
        assert_eq!(ErrorCode::UiaInitFailed.as_str(), "uia_init_failed");
        assert_eq!(
            ErrorCode::UnsupportedPlatform.as_str(),
            "unsupported_platform"
        );
        assert_eq!(ErrorCode::WaitFailed.as_str(), "wait_failed");
        assert_eq!(ErrorCode::WaitTimeout.as_str(), "wait_timeout");
        assert_eq!(ErrorCode::WindowEnumFailed.as_str(), "window_enum_failed");
        assert_eq!(ErrorCode::WorkerFailed.as_str(), "worker_failed");
        assert_eq!(ErrorCode::WorkspaceInvalid.as_str(), "workspace_invalid");
        assert_eq!(
            ErrorCode::WorkspaceUnconfigured.as_str(),
            "workspace_unconfigured"
        );
        assert_eq!(ErrorCode::WriteFailed.as_str(), "write_failed");
    }

    #[test]
    fn error_code_serializes_to_legacy_wire_strings() {
        assert_eq!(
            serde_json::to_value(ErrorCode::A11yBusy).unwrap(),
            json!("a11y_busy")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::AccessibilityPermissionDenied).unwrap(),
            json!("accessibility_permission_denied")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ActionUnavailable).unwrap(),
            json!("action_unavailable")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::AlreadyExists).unwrap(),
            json!("already_exists")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::AmbiguousProcessName).unwrap(),
            json!("ambiguous_process_name")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::AmbiguousReference).unwrap(),
            json!("ambiguous_reference")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::CaptureFailed).unwrap(),
            json!("capture_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::CaptureUnavailable).unwrap(),
            json!("capture_unavailable")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClickFailed).unwrap(),
            json!("click_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClickTimeout).unwrap(),
            json!("click_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardImageEncodeFailed).unwrap(),
            json!("clipboard_image_encode_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardImageInvalid).unwrap(),
            json!("clipboard_image_invalid")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardImageTooLarge).unwrap(),
            json!("clipboard_image_too_large")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardReadFailed).unwrap(),
            json!("clipboard_read_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardUnavailable).unwrap(),
            json!("clipboard_unavailable")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ClipboardWriteFailed).unwrap(),
            json!("clipboard_write_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::CloseFailed).unwrap(),
            json!("close_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::CreateFailed).unwrap(),
            json!("create_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::CursorMoveFailed).unwrap(),
            json!("cursor_move_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::DeadlineExceeded).unwrap(),
            json!("deadline_exceeded")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::DeleteFailed).unwrap(),
            json!("delete_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::DestExists).unwrap(),
            json!("dest_exists")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::DuplicateFailed).unwrap(),
            json!("duplicate_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ElementAtPointFailed).unwrap(),
            json!("element_at_point_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ElementAtPointTimeout).unwrap(),
            json!("element_at_point_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ElevationRequired).unwrap(),
            json!("elevation_required")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FileTooLarge).unwrap(),
            json!("file_too_large")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FindElementTimeout).unwrap(),
            json!("find_element_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FindFailed).unwrap(),
            json!("find_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FocusDenied).unwrap(),
            json!("focus_denied")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FocusFailed).unwrap(),
            json!("focus_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FocusMismatch).unwrap(),
            json!("focus_mismatch")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::FocusTimeout).unwrap(),
            json!("focus_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetEnvFailed).unwrap(),
            json!("get_env_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetFocusedFailed).unwrap(),
            json!("get_focused_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetFocusedTimeout).unwrap(),
            json!("get_focused_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetSelectionFailed).unwrap(),
            json!("get_selection_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetSelectionTimeout).unwrap(),
            json!("get_selection_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetTextFailed).unwrap(),
            json!("get_text_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetTextTimeout).unwrap(),
            json!("get_text_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetValueFailed).unwrap(),
            json!("get_value_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::GetValueTimeout).unwrap(),
            json!("get_value_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InspectFailed).unwrap(),
            json!("inspect_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InspectTimeout).unwrap(),
            json!("inspect_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidButton).unwrap(),
            json!("invalid_button")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidCoordinates).unwrap(),
            json!("invalid_coordinates")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidCount).unwrap(),
            json!("invalid_count")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidCwd).unwrap(),
            json!("invalid_cwd")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidDuration).unwrap(),
            json!("invalid_duration")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidExe).unwrap(),
            json!("invalid_exe")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidGlob).unwrap(),
            json!("invalid_glob")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidHwnd).unwrap(),
            json!("invalid_hwnd")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidInput).unwrap(),
            json!("invalid_input")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidKey).unwrap(),
            json!("invalid_key")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidKeys).unwrap(),
            json!("invalid_keys")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidName).unwrap(),
            json!("invalid_name")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidPath).unwrap(),
            json!("invalid_path")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidPid).unwrap(),
            json!("invalid_pid")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidProgram).unwrap(),
            json!("invalid_program")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidReference).unwrap(),
            json!("invalid_reference")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidScroll).unwrap(),
            json!("invalid_scroll")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvalidSize).unwrap(),
            json!("invalid_size")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvokeActionFailed).unwrap(),
            json!("invoke_action_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::InvokeActionTimeout).unwrap(),
            json!("invoke_action_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::IoError).unwrap(),
            json!("io_error")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::KillFailed).unwrap(),
            json!("kill_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ListWindowsTimeout).unwrap(),
            json!("list_windows_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::MoveFailed).unwrap(),
            json!("move_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::NoActiveWindow).unwrap(),
            json!("no_active_window")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::NotADirectory).unwrap(),
            json!("not_a_directory")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::NotAFile).unwrap(),
            json!("not_a_file")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::NotFound).unwrap(),
            json!("not_found")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::NotifyFailed).unwrap(),
            json!("notify_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::OpenFailed).unwrap(),
            json!("open_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::OsPermissionDenied).unwrap(),
            json!("os_permission_denied")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ParentMissing).unwrap(),
            json!("parent_missing")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::PatchApplyFailed).unwrap(),
            json!("patch_apply_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::PatchInvalidDiff).unwrap(),
            json!("patch_invalid_diff")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::PathTraversal).unwrap(),
            json!("path_traversal")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::PointMismatch).unwrap(),
            json!("point_mismatch")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ProcessEnumFailed).unwrap(),
            json!("process_enum_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ProcessInfoFailed).unwrap(),
            json!("process_info_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ProcessNotFound).unwrap(),
            json!("process_not_found")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::QueryTimeout).unwrap(),
            json!("query_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ReadFailed).unwrap(),
            json!("read_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ReadOutputFailed).unwrap(),
            json!("read_output_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ResizeFailed).unwrap(),
            json!("resize_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ResolveFailed).unwrap(),
            json!("resolve_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::RightClickFailed).unwrap(),
            json!("right_click_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::RightClickTimeout).unwrap(),
            json!("right_click_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ScrollElementTimeout).unwrap(),
            json!("scroll_element_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ScrollFailed).unwrap(),
            json!("scroll_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::ScrollUnavailable).unwrap(),
            json!("scroll_unavailable")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SelectionUnavailable).unwrap(),
            json!("selection_unavailable")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SendInputFailed).unwrap(),
            json!("send_input_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SendKeysFailed).unwrap(),
            json!("send_keys_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SendKeysTimeout).unwrap(),
            json!("send_keys_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SetValueFailed).unwrap(),
            json!("set_value_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SetValueTimeout).unwrap(),
            json!("set_value_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SnapshotFailed).unwrap(),
            json!("snapshot_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SnapshotTimeout).unwrap(),
            json!("snapshot_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::SpawnFailed).unwrap(),
            json!("spawn_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::StaleReference).unwrap(),
            json!("stale_reference")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::TargetDegraded).unwrap(),
            json!("target_degraded")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::TooManyEntries).unwrap(),
            json!("too_many_entries")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::UiaInitFailed).unwrap(),
            json!("uia_init_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::UnsupportedPlatform).unwrap(),
            json!("unsupported_platform")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WaitFailed).unwrap(),
            json!("wait_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WaitTimeout).unwrap(),
            json!("wait_timeout")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WindowEnumFailed).unwrap(),
            json!("window_enum_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WorkerFailed).unwrap(),
            json!("worker_failed")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WorkspaceInvalid).unwrap(),
            json!("workspace_invalid")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WorkspaceUnconfigured).unwrap(),
            json!("workspace_unconfigured")
        );
        assert_eq!(
            serde_json::to_value(ErrorCode::WriteFailed).unwrap(),
            json!("write_failed")
        );
    }

    #[test]
    fn unsupported_platform_preserves_capability_wording() {
        let err = unsupported_platform("Accessibility automation");
        assert_eq!(err.code, "unsupported_platform");
        assert_eq!(
            err.message,
            "Accessibility automation is only supported on Windows and macOS"
        );
    }
}
