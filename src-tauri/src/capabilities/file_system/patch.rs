use std::path::Path;

use diffy::{apply, Patch};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchError {
    InvalidDiff,
    MultiFileDiff,
    TargetMismatch,
    ApplyFailed,
}

pub fn apply_unified_diff(base: &str, diff: &str, expected_path: &str) -> Result<(String, usize), PatchError> {
    validate_single_file_target(diff, expected_path)?;

    let patch = Patch::from_str(diff).map_err(|_| PatchError::InvalidDiff)?;
    let hunks_applied = patch.hunks().len();
    let patched = apply(base, &patch).map_err(|_| PatchError::ApplyFailed)?;

    Ok((patched, hunks_applied))
}

fn validate_single_file_target(diff: &str, expected_path: &str) -> Result<(), PatchError> {
    let expected_name = Path::new(expected_path)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(PatchError::InvalidDiff)?;

    let mut plus_paths = Vec::new();
    let mut minus_paths = Vec::new();

    for line in diff.lines() {
        if let Some(path) = line.strip_prefix("+++ ") {
            if path == "+++ /dev/null" {
                continue;
            }
            plus_paths.push(normalize_diff_path(path));
        } else if let Some(path) = line.strip_prefix("--- ") {
            if path == "--- /dev/null" {
                continue;
            }
            minus_paths.push(normalize_diff_path(path));
        }
    }

    if plus_paths.is_empty() && minus_paths.is_empty() {
        return Err(PatchError::InvalidDiff);
    }

    let unique_plus: Vec<_> = plus_paths
        .iter()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let unique_minus: Vec<_> = minus_paths
        .iter()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();

    if unique_plus.len() > 1 || unique_minus.len() > 1 {
        return Err(PatchError::MultiFileDiff);
    }

    let target = unique_plus
        .first()
        .or(unique_minus.first())
        .ok_or(PatchError::InvalidDiff)?;
    let target_name = Path::new(target)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(PatchError::InvalidDiff)?;

    if target_name != expected_name {
        return Err(PatchError::TargetMismatch);
    }

    Ok(())
}

fn normalize_diff_path(path: &str) -> String {
    let trimmed = path.trim();
    let without_tab = trimmed.split('\t').next().unwrap_or(trimmed);
    let normalized = without_tab
        .trim_start_matches("a/")
        .trim_start_matches("b/");
    normalized.replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "line one\nline two\nline three\n";

    const SIMPLE_DIFF: &str = "\
--- a/example.txt
+++ b/example.txt
@@ -1,3 +1,4 @@
 line one
+inserted
 line two
 line three
";

    #[test]
    fn applies_insert_hunk() {
        let (patched, hunks) =
            apply_unified_diff(BASE, SIMPLE_DIFF, "example.txt").expect("apply patch");

        assert_eq!(hunks, 1);
        assert!(patched.contains("inserted"));
    }

    #[test]
    fn rejects_multi_file_diff() {
        let diff = "\
--- a/one.txt
+++ b/one.txt
@@ -1 +1,2 @@
 a
+b
--- a/two.txt
+++ b/two.txt
@@ -1 +1,2 @@
 c
+d
";

        let error = apply_unified_diff("a\n", diff, "one.txt").expect_err("multi file");
        assert_eq!(error, PatchError::MultiFileDiff);
    }

    #[test]
    fn rejects_target_mismatch() {
        let error =
            apply_unified_diff(BASE, SIMPLE_DIFF, "other.txt").expect_err("target mismatch");

        assert_eq!(error, PatchError::TargetMismatch);
    }

    #[test]
    fn rejects_invalid_diff() {
        let error = apply_unified_diff(BASE, "not a diff", "example.txt").expect_err("invalid");
        assert_eq!(error, PatchError::InvalidDiff);
    }
}
