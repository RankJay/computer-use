use std::collections::VecDeque;
use std::time::Instant;

use uiautomation::core::UIElement;
use uiautomation::errors::ERR_NOTFOUND;
use uiautomation::types::{ControlType, TreeScope};

use crate::capabilities::error::{CommandError, ErrorCode};
use crate::capabilities::window::WindowId;

use super::super::arena::NodeRecord;
use super::super::budget::{SearchBudget, SNAPSHOT_MAX_NODES};
use super::session::{
    element_automation_id, element_control_type, element_is_enabled, element_is_offscreen,
    element_name, element_rect, element_runtime_id, element_value_text, hwnd_from_id,
    is_transaction_timeout, is_useful_value, map_uia_error, should_skip_control, UiaSession,
};

pub(super) struct ExtractedTree {
    pub nodes: Vec<NodeRecord>,
    pub used_bfs: bool,
}

pub(super) fn fetch_tree(
    session: &UiaSession,
    hwnd: WindowId,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let handle = hwnd_from_id(hwnd)?;
    match session
        .automation
        .element_from_handle_build_cache(handle, &session.subtree_cache)
    {
        Ok(root) => {
            let mut nodes = Vec::new();
            let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
            extract_cached_subtree(&root, None, 0, max_depth, &[], &mut nodes, &mut budget)?;
            Ok(ExtractedTree {
                nodes,
                used_bfs: false,
            })
        }
        Err(error) if is_transaction_timeout(&error) || Instant::now() >= deadline => {
            fetch_tree_bfs(session, hwnd, max_depth, deadline)
        }
        Err(error) => {
            // Fall back to BFS on other bulk failures (provider quirks).
            match fetch_tree_bfs(session, hwnd, max_depth, deadline) {
                Ok(tree) => Ok(tree),
                Err(_) => Err(map_uia_error(error, ErrorCode::SnapshotFailed)),
            }
        }
    }
}

pub(super) fn fetch_tree_from_element(
    session: &UiaSession,
    element: &UIElement,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    // Re-cache the live element with subtree scope.
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    if runtime_id.is_empty() {
        let mut nodes = Vec::new();
        let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
        extract_via_bfs_from(session, element, max_depth, &mut nodes, &mut budget)?;
        return Ok(ExtractedTree {
            nodes,
            used_bfs: true,
        });
    }

    let handle = element.get_native_window_handle().ok().and_then(|h| {
        let raw: isize = h.into();
        if raw == 0 {
            None
        } else {
            Some(WindowId(raw as i64))
        }
    });

    if let Some(hwnd) = handle {
        return fetch_tree(session, hwnd, max_depth, deadline);
    }

    // Resolve via runtime id from a live window root if possible — else BFS from element.
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
    extract_via_bfs_from(session, element, max_depth, &mut nodes, &mut budget)?;
    Ok(ExtractedTree {
        nodes,
        used_bfs: true,
    })
}

fn fetch_tree_bfs(
    session: &UiaSession,
    hwnd: WindowId,
    max_depth: u32,
    deadline: Instant,
) -> Result<ExtractedTree, CommandError> {
    let handle = hwnd_from_id(hwnd)?;
    let root = session
        .automation
        .element_from_handle_build_cache(handle, &session.children_cache)
        .map_err(|error| map_uia_error(error, ErrorCode::SnapshotFailed))?;
    let mut nodes = Vec::new();
    let mut budget = SearchBudget::until(deadline, SNAPSHOT_MAX_NODES);
    extract_via_bfs_from(session, &root, max_depth, &mut nodes, &mut budget)?;
    Ok(ExtractedTree {
        nodes,
        used_bfs: true,
    })
}

fn extract_cached_subtree(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    max_depth: u32,
    ancestors: &[String],
    nodes: &mut Vec<NodeRecord>,
    budget: &mut SearchBudget,
) -> Result<(), CommandError> {
    if budget.exhausted() || depth > max_depth {
        return Ok(());
    }
    if !budget.visit_soft() {
        return Ok(());
    }

    let Some(record) = project_element_allow_text(element, parent, depth, ancestors) else {
        return Ok(());
    };
    let idx = nodes.len() as u32;
    if let Some(parent_idx) = parent {
        if let Some(parent_node) = nodes.get_mut(parent_idx as usize) {
            parent_node.children.push(idx);
        }
    }
    let label = ancestor_label(&record);
    let mut child_ancestors = ancestors.to_vec();
    child_ancestors.push(label);
    nodes.push(record);

    if depth >= max_depth {
        return Ok(());
    }

    let children = element.get_cached_children().unwrap_or_default();
    for child in children {
        extract_cached_subtree(
            &child,
            Some(idx),
            depth + 1,
            max_depth,
            &child_ancestors,
            nodes,
            budget,
        )?;
    }
    Ok(())
}

fn extract_via_bfs_from(
    session: &UiaSession,
    root: &UIElement,
    max_depth: u32,
    nodes: &mut Vec<NodeRecord>,
    budget: &mut SearchBudget,
) -> Result<(), CommandError> {
    let true_condition = session
        .automation
        .create_true_condition()
        .map_err(|error| map_uia_error(error, ErrorCode::SnapshotFailed))?;

    let Some(root_record) = project_element_allow_text(root, None, 0, &[]) else {
        return Ok(());
    };
    if !budget.visit_soft() {
        return Ok(());
    }
    nodes.push(root_record);

    // Queue: (parent_idx, live_or_cached parent element for Children find)
    let mut queue: VecDeque<(u32, UIElement)> = VecDeque::new();
    queue.push_back((0, root.clone()));

    while let Some((parent_idx, parent_el)) = queue.pop_front() {
        if budget.exhausted() {
            break;
        }
        let parent_depth = nodes[parent_idx as usize].depth;
        if parent_depth >= max_depth {
            continue;
        }

        let children = match parent_el.find_all_build_cache(
            TreeScope::Children,
            &true_condition,
            &session.children_cache,
        ) {
            Ok(c) => c,
            Err(error) if error.code() == ERR_NOTFOUND => continue,
            Err(_) => continue,
        };

        let ancestors = {
            let node = &nodes[parent_idx as usize];
            let mut chain = node.ancestor_chain.clone();
            chain.push(ancestor_label(node));
            chain
        };

        for child in children {
            if budget.exhausted() || !budget.visit_soft() {
                break;
            }
            let depth = parent_depth + 1;
            let Some(record) =
                project_element_allow_text(&child, Some(parent_idx), depth, &ancestors)
            else {
                continue;
            };
            let idx = nodes.len() as u32;
            nodes[parent_idx as usize].children.push(idx);
            nodes.push(record);
            if depth < max_depth {
                queue.push_back((idx, child));
            }
        }
    }
    Ok(())
}

pub(super) fn project_element(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
) -> Option<NodeRecord> {
    let control_type = element_control_type(element).ok()?;
    if should_skip_control(control_type) {
        return None;
    }
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    let enabled = element_is_enabled(element).unwrap_or(true);
    let offscreen = element_is_offscreen(element).unwrap_or(false);
    let rect = element_rect(element);
    let value = element_value_text(element).filter(|v| is_useful_value(v));
    Some(NodeRecord {
        parent,
        children: Vec::new(),
        runtime_id,
        automation_id,
        name,
        role: Some(control_type.to_string()),
        control_type_raw: control_type as i32,
        enabled,
        offscreen,
        rect,
        value,
        ancestor_chain: ancestors.to_vec(),
        depth,
    })
}

/// Like `project_element` but keeps Text nodes (needed for focused/hit-test targets).
pub(super) fn project_element_allow_text(
    element: &UIElement,
    parent: Option<u32>,
    depth: u32,
    ancestors: &[String],
) -> Option<NodeRecord> {
    let control_type = element_control_type(element).ok()?;
    if matches!(
        control_type,
        ControlType::Image | ControlType::Separator | ControlType::ToolTip
    ) {
        return None;
    }
    let name = element_name(element);
    let automation_id = element_automation_id(element);
    let runtime_id = element_runtime_id(element).unwrap_or_default();
    let enabled = element_is_enabled(element).unwrap_or(true);
    let offscreen = element_is_offscreen(element).unwrap_or(false);
    let rect = element_rect(element);
    let value = element_value_text(element).filter(|v| is_useful_value(v));
    Some(NodeRecord {
        parent,
        children: Vec::new(),
        runtime_id,
        automation_id,
        name,
        role: Some(control_type.to_string()),
        control_type_raw: control_type as i32,
        enabled,
        offscreen,
        rect,
        value,
        ancestor_chain: ancestors.to_vec(),
        depth,
    })
}

fn ancestor_label(record: &NodeRecord) -> String {
    let role = record.role.as_deref().unwrap_or("unknown");
    format!("{role}:{}", record.name)
}
