//! AX tree walk into portable [`NodeRecord`] arenas.

use std::collections::VecDeque;
use std::time::Instant;

use objc2_application_services::AXUIElement;
use objc2_core_foundation::CFRetained;

use crate::capabilities::error::{CommandError, ErrorCode};

use super::super::arena::NodeRecord;
use super::super::budget::{SearchBudget, SNAPSHOT_MAX_NODES};
use super::roles::{map_ax_role, should_skip_role_allow_text};
use super::session::{
    ax_window_for_info, element_children, element_node_attrs, AxSession, CgWindowInfo, NodeAttrs,
};

pub(super) struct ExtractedTree {
    pub nodes: Vec<NodeRecord>,
    pub used_bfs: bool,
}

pub(super) fn fetch_tree(
    _session: &AxSession,
    info: &CgWindowInfo,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let root = ax_window_for_info(info).map_err(|error| {
        if error.code == ErrorCode::AccessibilityPermissionDenied.as_str()
            || error.code == ErrorCode::InvalidHwnd.as_str()
        {
            error
        } else {
            CommandError::new(ErrorCode::SnapshotFailed, error.message)
        }
    })?;
    fetch_tree_from_element(&root, max_depth, deadline)
}

pub(super) fn fetch_tree_from_element(
    root: &AXUIElement,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
    extract_via_bfs(root, max_depth, &mut nodes, &mut budget)?;
    Ok(ExtractedTree {
        nodes,
        used_bfs: true,
    })
}

fn extract_via_bfs(
    root: &AXUIElement,
    max_depth: u32,
    nodes: &mut Vec<NodeRecord>,
    budget: &mut SearchBudget,
) -> Result<(), CommandError> {
    let Some((root_record, root_children)) = project_element_with_children(root, None, 0, &[], &[])
    else {
        return Ok(());
    };
    if !budget.visit_soft() {
        return Ok(());
    }
    nodes.push(root_record);

    // Queue: (parent_idx, path_from_root, batched children)
    let mut queue: VecDeque<(u32, Vec<i32>, Vec<CFRetained<AXUIElement>>)> = VecDeque::new();
    queue.push_back((0, Vec::new(), root_children));

    while let Some((parent_idx, path, children)) = queue.pop_front() {
        if budget.exhausted() {
            break;
        }
        let parent_depth = nodes[parent_idx as usize].depth;
        if parent_depth >= max_depth {
            continue;
        }

        let ancestors = {
            let node = &nodes[parent_idx as usize];
            let mut chain = node.ancestor_chain.clone();
            chain.push(ancestor_label(node));
            chain
        };

        for (child_index, child) in children.into_iter().enumerate() {
            if budget.exhausted() || !budget.visit_soft() {
                break;
            }
            let depth = parent_depth + 1;
            let mut child_path = path.clone();
            child_path.push(child_index as i32);
            let Some((record, grandchildren)) = project_element_with_children(
                &child,
                Some(parent_idx),
                depth,
                &ancestors,
                &child_path,
            ) else {
                continue;
            };
            let idx = nodes.len() as u32;
            nodes[parent_idx as usize].children.push(idx);
            nodes.push(record);
            if depth < max_depth {
                queue.push_back((idx, child_path, grandchildren));
            }
        }
    }
    Ok(())
}

/// Collect descendants for query without requiring a prior snapshot.
pub(super) fn collect_descendants(
    root: &AXUIElement,
    max_nodes: u32,
    deadline: Instant,
) -> Vec<NodeRecord> {
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, max_nodes);
    let _ = extract_via_bfs(root, 20, &mut nodes, &mut budget);
    nodes
}

pub(super) fn project_element_allow_text(
    element: &AXUIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
    path: &[i32],
) -> Option<NodeRecord> {
    project_element_with_children(element, parent, depth, ancestors, path).map(|(record, _)| record)
}

fn project_element_with_children(
    element: &AXUIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
    path: &[i32],
) -> Option<(NodeRecord, Vec<CFRetained<AXUIElement>>)> {
    let attrs = element_node_attrs(element);
    if should_skip_role_allow_text(&attrs.role) {
        return None;
    }
    Some(project_from_attrs(attrs, parent, depth, ancestors, path))
}

fn project_from_attrs(
    attrs: NodeAttrs,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
    path: &[i32],
) -> (NodeRecord, Vec<CFRetained<AXUIElement>>) {
    let (control_type_raw, label) = map_ax_role(&attrs.role);
    let offscreen = attrs.rect.is_none_or(|(l, t, r, b)| r <= l || b <= t);
    let record = NodeRecord {
        parent,
        children: Vec::new(),
        runtime_id: path.to_vec(),
        automation_id: attrs.automation_id,
        name: attrs.name,
        role: Some(label.to_string()),
        control_type_raw,
        enabled: attrs.enabled,
        offscreen,
        rect: attrs.rect,
        value: attrs.value,
        ancestor_chain: ancestors.to_vec(),
        depth,
    };
    (record, attrs.children)
}

fn ancestor_label(record: &NodeRecord) -> String {
    let role = record.role.as_deref().unwrap_or("unknown");
    format!("{role}:{}", record.name)
}

/// Walk a stored path of child indices from `root`.
pub(super) fn walk_path(root: &AXUIElement, path: &[i32]) -> Option<CFRetained<AXUIElement>> {
    let mut current = CFRetained::from(root);
    for &index in path {
        if index < 0 {
            return None;
        }
        let children = element_children(&current);
        let child = children.into_iter().nth(index as usize)?;
        current = child;
    }
    Some(current)
}
