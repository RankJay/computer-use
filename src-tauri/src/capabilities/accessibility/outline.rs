//! Portable outline emission over [`NodeRecord`] / arena trees.
//!
//! Control types use raw UIA `ControlType` i32 values so this module stays
//! free of the `uiautomation` crate (macOS adapters can encode the same ints).

use crate::capabilities::window::WindowId;

use super::arena::NodeRecord;
use super::state::{make_reference, SnapshotStore, StoredElement};
use super::types::{TextResult, MAX_OUTLINE_CHARS, SIBLING_FINGERPRINT_EMIT};

pub(crate) const CT_BUTTON: i32 = 50000;
pub(crate) const CT_CHECK_BOX: i32 = 50002;
pub(crate) const CT_COMBO_BOX: i32 = 50003;
pub(crate) const CT_EDIT: i32 = 50004;
pub(crate) const CT_HYPERLINK: i32 = 50005;
pub(crate) const CT_IMAGE: i32 = 50006;
pub(crate) const CT_LIST_ITEM: i32 = 50007;
pub(crate) const CT_MENU_ITEM: i32 = 50011;
pub(crate) const CT_RADIO_BUTTON: i32 = 50013;
pub(crate) const CT_SLIDER: i32 = 50015;
pub(crate) const CT_SPINNER: i32 = 50016;
pub(crate) const CT_TAB_ITEM: i32 = 50019;
pub(crate) const CT_TEXT: i32 = 50020;
pub(crate) const CT_TREE_ITEM: i32 = 50024;
pub(crate) const CT_GROUP: i32 = 50026;
pub(crate) const CT_DOCUMENT: i32 = 50030;
pub(crate) const CT_SPLIT_BUTTON: i32 = 50031;
pub(crate) const CT_WINDOW: i32 = 50032;
pub(crate) const CT_PANE: i32 = 50033;

#[derive(Debug, Clone, Copy)]
#[cfg_attr(not(feature = "a11y-bench"), allow(dead_code))]
pub struct SnapshotStats {
    pub nodes_visited: u32,
    pub emitted: u32,
}

pub(crate) struct OutlineEmit {
    pub text: String,
    pub visited: u32,
    pub emitted: u32,
    pub truncated: bool,
    pub truncation_reason: Option<String>,
}

pub(crate) fn is_interactive_raw(raw: i32) -> bool {
    matches!(
        raw,
        CT_BUTTON
            | CT_EDIT
            | CT_COMBO_BOX
            | CT_CHECK_BOX
            | CT_RADIO_BUTTON
            | CT_MENU_ITEM
            | CT_HYPERLINK
            | CT_TAB_ITEM
            | CT_LIST_ITEM
            | CT_TREE_ITEM
            | CT_SLIDER
            | CT_SPINNER
            | CT_SPLIT_BUTTON
    )
}

/// Shallow Document/Pane nodes hold Chromium web content — always descend into them.
/// Only collapse deep structural panes to limit token use.
pub(crate) fn should_collapse_raw(raw: i32, depth: u32) -> bool {
    raw == CT_PANE && depth >= 6
}

pub(crate) fn finalize_outline(
    outline: OutlineEmit,
    generation: u32,
    used_bfs: bool,
) -> (TextResult, SnapshotStats) {
    let mut text = outline.text;
    if outline.truncated {
        if let Some(reason) = &outline.truncation_reason {
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&format!("[truncated:{reason}]"));
        }
    }
    if used_bfs {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str("[fetch:bfs_fallback]");
    }

    let stats = SnapshotStats {
        nodes_visited: outline.visited,
        emitted: outline.emitted,
    };
    (
        TextResult {
            text,
            generation: Some(generation),
            visited: Some(outline.visited),
            emitted: Some(outline.emitted),
            truncated: Some(outline.truncated),
            truncation_reason: outline.truncation_reason,
        },
        stats,
    )
}

#[allow(clippy::too_many_arguments)] // mirrors prior windows_impl signature
pub(crate) fn emit_outline_from_arena(
    store: &SnapshotStore,
    hwnd: WindowId,
    generation: u32,
    process_id: u32,
    nodes: &[NodeRecord],
    root_idx: usize,
    max_depth: u32,
    max_elements: u32,
    force_children: bool,
) -> OutlineEmit {
    let mut lines = Vec::new();
    let mut char_count = 0usize;
    let mut next_index = 0u32;
    let mut emitted = 0u32;
    let mut visited = 0u32;
    let mut truncated = false;
    let mut truncation_reason = None;

    if root_idx >= nodes.len() {
        return OutlineEmit {
            text: String::new(),
            visited: 0,
            emitted: 0,
            truncated: false,
            truncation_reason: None,
        };
    }

    fn push_line(
        lines: &mut Vec<String>,
        char_count: &mut usize,
        truncated: &mut bool,
        truncation_reason: &mut Option<String>,
        line: String,
    ) -> bool {
        let extra = if lines.is_empty() {
            line.len()
        } else {
            line.len() + 1
        };
        if *char_count + extra > MAX_OUTLINE_CHARS {
            *truncated = true;
            *truncation_reason = Some("token_cap".to_string());
            return false;
        }
        *char_count += extra;
        lines.push(line);
        true
    }

    fn sibling_fingerprint(node: &NodeRecord) -> (i32, &str, bool, bool) {
        (
            node.control_type_raw,
            node.name.as_str(),
            node.enabled,
            node.offscreen,
        )
    }

    #[allow(clippy::too_many_arguments)] // mirrors prior windows_impl signature
    fn walk(
        store: &SnapshotStore,
        hwnd: WindowId,
        generation: u32,
        process_id: u32,
        nodes: &[NodeRecord],
        idx: usize,
        depth: u32,
        max_depth: u32,
        max_elements: u32,
        force_children: bool,
        lines: &mut Vec<String>,
        char_count: &mut usize,
        next_index: &mut u32,
        emitted: &mut u32,
        visited: &mut u32,
        truncated: &mut bool,
        truncation_reason: &mut Option<String>,
    ) {
        if matches!(
            truncation_reason.as_deref(),
            Some("token_cap" | "max_elements")
        ) {
            return;
        }
        if *emitted >= max_elements {
            *truncated = true;
            *truncation_reason = Some("max_elements".to_string());
            return;
        }
        *visited = visited.saturating_add(1);
        let node = &nodes[idx];

        // Text stays in the arena for get_text, but is omitted from outline emission
        // (transparent: children keep the Text node's depth).
        if node.control_type_raw == CT_TEXT {
            for &child in &node.children {
                if matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                ) {
                    break;
                }
                walk(
                    store,
                    hwnd,
                    generation,
                    process_id,
                    nodes,
                    child as usize,
                    depth,
                    max_depth,
                    max_elements,
                    force_children,
                    lines,
                    char_count,
                    next_index,
                    emitted,
                    visited,
                    truncated,
                    truncation_reason,
                );
            }
            return;
        }

        let collapse = !force_children && should_collapse_raw(node.control_type_raw, depth);
        let interactive = is_interactive_raw(node.control_type_raw) || !node.name.trim().is_empty();

        if interactive || collapse {
            *next_index = next_index.saturating_add(1);
            let reference = make_reference(*next_index, generation, hwnd);
            store.store_element(
                hwnd,
                generation,
                reference.clone(),
                stored_from_record(hwnd, process_id, node),
            );
            let line = format_record_line(node, depth, &reference, None);
            if !push_line(lines, char_count, truncated, truncation_reason, line) {
                return;
            }
            *emitted = emitted.saturating_add(1);
        }

        if collapse {
            return;
        }
        if depth >= max_depth {
            if !node.children.is_empty() {
                *truncated = true;
                *truncation_reason = Some("max_depth".to_string());
            }
            return;
        }
        if *emitted >= max_elements {
            *truncated = true;
            *truncation_reason = Some("max_elements".to_string());
            return;
        }

        let children = &node.children;
        let mut i = 0usize;
        while i < children.len() {
            if matches!(
                truncation_reason.as_deref(),
                Some("token_cap" | "max_elements")
            ) {
                break;
            }
            if *emitted >= max_elements {
                let omit = format!(
                    "{:indent$}+more elements omitted",
                    "",
                    indent = (depth as usize + 1) * 2
                );
                let _ = push_line(lines, char_count, truncated, truncation_reason, omit);
                *truncated = true;
                *truncation_reason = Some("max_elements".to_string());
                break;
            }

            let fp = sibling_fingerprint(&nodes[children[i] as usize]);
            let mut run_end = i + 1;
            while run_end < children.len()
                && sibling_fingerprint(&nodes[children[run_end] as usize]) == fp
            {
                run_end += 1;
            }
            let run_len = run_end - i;
            let emit_count = run_len.min(SIBLING_FINGERPRINT_EMIT as usize);

            for j in 0..emit_count {
                if matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                ) || *emitted >= max_elements
                {
                    break;
                }
                walk(
                    store,
                    hwnd,
                    generation,
                    process_id,
                    nodes,
                    children[i + j] as usize,
                    depth + 1,
                    max_depth,
                    max_elements,
                    false,
                    lines,
                    char_count,
                    next_index,
                    emitted,
                    visited,
                    truncated,
                    truncation_reason,
                );
            }

            if run_len > emit_count
                && !matches!(
                    truncation_reason.as_deref(),
                    Some("token_cap" | "max_elements")
                )
            {
                let n = run_len - emit_count;
                let compress = format!(
                    "{:indent$}+{n} more like this",
                    "",
                    indent = (depth as usize + 1) * 2
                );
                if push_line(lines, char_count, truncated, truncation_reason, compress) {
                    *truncated = true;
                    if truncation_reason.is_none()
                        || truncation_reason.as_deref() == Some("sibling_compress")
                    {
                        *truncation_reason = Some("sibling_compress".to_string());
                    }
                }
            }

            i = run_end;
        }
    }

    walk(
        store,
        hwnd,
        generation,
        process_id,
        nodes,
        root_idx,
        0,
        max_depth,
        max_elements,
        force_children,
        &mut lines,
        &mut char_count,
        &mut next_index,
        &mut emitted,
        &mut visited,
        &mut truncated,
        &mut truncation_reason,
    );

    OutlineEmit {
        text: lines.join("\n"),
        visited,
        emitted,
        truncated,
        truncation_reason,
    }
}

pub(crate) fn stored_from_record(
    hwnd: WindowId,
    process_id: u32,
    node: &NodeRecord,
) -> StoredElement {
    StoredElement {
        hwnd,
        runtime_id: node.runtime_id.clone(),
        process_id,
        name: node.name.clone(),
        role: node.role.clone(),
        automation_id: node.automation_id.clone(),
        rect: node.rect,
        ancestor_chain: node.ancestor_chain.clone(),
    }
}

pub(crate) fn format_record_line(
    node: &NodeRecord,
    depth: u32,
    reference: &str,
    match_tier: Option<&str>,
) -> String {
    let role = node.role.as_deref().unwrap_or("unknown");
    let name = node.name.replace('"', "'");
    let mut state: Vec<String> = Vec::new();
    if !node.enabled {
        state.push("disabled".to_string());
    }
    if node.offscreen {
        state.push("offscreen".to_string());
    }
    if let Some(value) = &node.value {
        state.push(format!("value=\"{}\"", value.replace('"', "'")));
    }
    if let Some(tier) = match_tier {
        state.push(format!("match={tier}"));
    }
    let state_suffix = if state.is_empty() {
        String::new()
    } else {
        format!(" [{}]", state.join(", "))
    };
    format!(
        "{:indent$}{reference} {role} \"{name}\"{state_suffix}",
        "",
        indent = depth as usize * 2
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::window::WindowId;

    fn node(
        control_type_raw: i32,
        name: &str,
        role: &str,
        children: Vec<u32>,
        parent: Option<u32>,
        depth: u32,
        runtime_id: i32,
    ) -> NodeRecord {
        NodeRecord {
            parent,
            children,
            runtime_id: vec![runtime_id],
            automation_id: String::new(),
            name: name.to_string(),
            role: Some(role.to_string()),
            control_type_raw,
            enabled: true,
            offscreen: false,
            rect: None,
            value: None,
            ancestor_chain: vec![],
            depth,
        }
    }

    #[test]
    fn interactive_control_detection() {
        assert!(is_interactive_raw(CT_BUTTON));
        assert!(!is_interactive_raw(CT_PANE));
    }

    #[test]
    fn browser_content_nodes_are_not_collapsed() {
        assert!(!should_collapse_raw(CT_DOCUMENT, 0));
        assert!(!should_collapse_raw(CT_PANE, 0));
        assert!(!should_collapse_raw(CT_PANE, 3));
        assert!(should_collapse_raw(CT_PANE, 6));
    }

    #[test]
    fn emit_outline_for_small_tree() {
        let store = SnapshotStore::default();
        let hwnd = WindowId(42);
        let nodes = vec![
            node(CT_PANE, "Dialog", "Pane", vec![1, 2], None, 0, 1),
            node(CT_BUTTON, "OK", "Button", vec![], Some(0), 1, 2),
            node(CT_BUTTON, "Cancel", "Button", vec![], Some(0), 1, 3),
        ];
        let generation = store.begin_generation(hwnd);
        let outline =
            emit_outline_from_arena(&store, hwnd, generation, 7, &nodes, 0, 10, 150, false);
        const GOLDEN: &str = "\
e1@1:42 Pane \"Dialog\"
  e2@1:42 Button \"OK\"
  e3@1:42 Button \"Cancel\"";
        assert_eq!(outline.text, GOLDEN);
        assert_eq!(outline.emitted, 3);
        assert_eq!(generation, 1);
    }

    #[test]
    fn sibling_compression_emits_plus_n_more() {
        let store = SnapshotStore::default();
        let hwnd = WindowId(99);
        let mut children = Vec::new();
        let mut nodes = vec![node(CT_PANE, "List", "Pane", vec![], None, 0, 1)];
        for i in 0..5 {
            children.push((i + 1) as u32);
            nodes.push(node(
                CT_LIST_ITEM,
                "Item",
                "ListItem",
                vec![],
                Some(0),
                1,
                i + 2,
            ));
        }
        nodes[0].children = children;
        let generation = store.begin_generation(hwnd);
        let outline =
            emit_outline_from_arena(&store, hwnd, generation, 1, &nodes, 0, 10, 150, false);
        assert!(
            outline.text.contains("+2 more like this"),
            "outline:\n{}",
            outline.text
        );
        assert_eq!(
            outline.truncation_reason.as_deref(),
            Some("sibling_compress")
        );
    }

    #[test]
    fn text_nodes_omitted_from_outline_but_present_in_arena() {
        let store = SnapshotStore::default();
        let hwnd = WindowId(7);
        let nodes = vec![
            node(CT_PANE, "Dialog", "Pane", vec![1, 2], None, 0, 1),
            node(CT_TEXT, "Are you sure?", "Text", vec![], Some(0), 1, 2),
            node(CT_BUTTON, "OK", "Button", vec![], Some(0), 1, 3),
        ];
        let generation = store.begin_generation(hwnd);
        let outline =
            emit_outline_from_arena(&store, hwnd, generation, 1, &nodes, 0, 10, 150, false);
        assert!(
            !outline.text.contains("Are you sure?"),
            "outline:\n{}",
            outline.text
        );
        assert!(outline.text.contains("Button \"OK\""));
        // Arena still holds the Text node (caller's responsibility); emit just skips it.
        assert_eq!(nodes[1].control_type_raw, CT_TEXT);
        assert_eq!(nodes[1].name, "Are you sure?");
    }

    #[test]
    fn reference_round_trip_via_outline_store() {
        let store = SnapshotStore::default();
        let hwnd = WindowId(55);
        let nodes = vec![node(CT_BUTTON, "Go", "Button", vec![], None, 0, 9)];
        let generation = store.begin_generation(hwnd);
        let outline =
            emit_outline_from_arena(&store, hwnd, generation, 3, &nodes, 0, 10, 150, false);
        let reference = outline
            .text
            .split_whitespace()
            .next()
            .expect("reference token");
        let stored = store.resolve_ref(reference).expect("stored");
        assert_eq!(stored.name, "Go");
        assert_eq!(stored.runtime_id, vec![9]);
        assert_eq!(stored.hwnd, hwnd);
    }
}
