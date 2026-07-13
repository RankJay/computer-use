//! Platform seam for turning a user-supplied app name/path into something spawnable.

use std::path::Path;

use crate::capabilities::error::CommandError;

#[cfg(windows)]
use super::win_resolver::WinResolver;

#[cfg(target_os = "macos")]
use super::mac_resolver::MacResolver;

#[cfg(not(any(windows, target_os = "macos")))]
use super::unsupported_resolver::UnsupportedResolver;

/// Resolved path or PATH name ready for `std::process::Command`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedExecutable {
    pub path: String,
    /// `.app` bundle dir when resolution went through a bundle (macOS only).
    pub app_bundle: Option<String>,
}

impl ResolvedExecutable {
    pub fn cli(path: String) -> Self {
        Self {
            path,
            app_bundle: None,
        }
    }

    /// macOS resolver (and cross-platform tests) only.
    #[allow(dead_code)]
    pub fn bundle(path: String, bundle: String) -> Self {
        Self {
            path,
            app_bundle: Some(bundle),
        }
    }
}

/// Platform seam for executable resolution. Callers use [`super::resolver`]; OS details stay in adapters.
pub trait ExecutableResolver: Send + Sync {
    /// Resolve a user-supplied app name/path to something spawnable.
    fn resolve(&self, name: &str) -> Result<ResolvedExecutable, CommandError>;
}

/// Absolute paths, relative paths with separators, and existing cwd-relative names pass through.
pub(crate) fn as_path_literal(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Some(trimmed.to_string());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() || trimmed.contains(['/', '\\']) || path.exists() {
        return Some(trimmed.to_string());
    }
    None
}

/// Process-wide executable resolver. Single `#[cfg]` switch for the adapter.
pub fn resolver() -> &'static dyn ExecutableResolver {
    #[cfg(windows)]
    {
        static RESOLVER: WinResolver = WinResolver;
        &RESOLVER
    }
    #[cfg(target_os = "macos")]
    {
        static RESOLVER: MacResolver = MacResolver;
        &RESOLVER
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        static RESOLVER: UnsupportedResolver = UnsupportedResolver;
        &RESOLVER
    }
}

#[cfg(test)]
pub(crate) mod fake {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::{as_path_literal, ExecutableResolver, ResolvedExecutable};
    use crate::capabilities::error::CommandError;

    /// Test double: canned bare-name map; path literals still pass through.
    pub struct FakeResolver {
        bare: Mutex<HashMap<String, ResolvedExecutable>>,
    }

    impl FakeResolver {
        pub fn new(
            entries: impl IntoIterator<Item = (impl Into<String>, impl Into<String>)>,
        ) -> Self {
            let bare = entries
                .into_iter()
                .map(|(k, v)| (k.into(), ResolvedExecutable::cli(v.into())))
                .collect();
            Self {
                bare: Mutex::new(bare),
            }
        }

        /// Bare name → full [`ResolvedExecutable`] (including optional `app_bundle`).
        pub fn new_resolved(
            entries: impl IntoIterator<Item = (impl Into<String>, ResolvedExecutable)>,
        ) -> Self {
            let bare = entries
                .into_iter()
                .map(|(k, resolved)| (k.into(), resolved))
                .collect();
            Self {
                bare: Mutex::new(bare),
            }
        }
    }

    impl ExecutableResolver for FakeResolver {
        fn resolve(&self, name: &str) -> Result<ResolvedExecutable, CommandError> {
            if let Some(path) = as_path_literal(name) {
                return Ok(ResolvedExecutable::cli(path));
            }
            let key = name.trim().to_string();
            let bare = self.bare.lock().expect("fake resolver lock");
            Ok(bare
                .get(&key)
                .cloned()
                .unwrap_or_else(|| ResolvedExecutable::cli(key)))
        }
    }
}
