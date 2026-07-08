use glob::Pattern;
use serde::Serialize;
use walkdir::WalkDir;

use crate::capabilities::path_utils::{self, CommandError};

const MAX_MATCHES: usize = 100;

#[derive(Debug, Serialize)]
pub struct SearchFilesResult {
    pub matches: Vec<String>,
}

#[tauri::command]
pub fn search_files(
    query: String,
    glob: String,
    workspace_root: String,
) -> Result<SearchFilesResult, CommandError> {
    let root = path_utils::resolve_root(&workspace_root)?;
    let pattern = Pattern::new(&glob).map_err(|error| {
        CommandError::new("invalid_glob", format!("Invalid glob pattern: {error}"))
    })?;

    let query = query.trim().to_lowercase();
    let mut matches = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let absolute = entry.path();
        let relative = path_utils::to_workspace_relative(&root, absolute);

        if !pattern.matches(&relative) {
            continue;
        }

        if !query.is_empty() {
            let haystack = relative.to_lowercase();
            let content_match = fs_read_contains(absolute, &query);
            if !haystack.contains(&query) && !content_match {
                continue;
            }
        }

        matches.push(relative);
        if matches.len() >= MAX_MATCHES {
            break;
        }
    }

    matches.sort();

    Ok(SearchFilesResult { matches })
}

fn fs_read_contains(path: &std::path::Path, query: &str) -> bool {
    let Ok(content) = std::fs::read_to_string(path) else {
        return false;
    };
    content.to_lowercase().contains(query)
}
