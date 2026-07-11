//! Portable query matching over [`NodeRecord`] (no UIA dependency).

use crate::capabilities::error::{CommandError, ErrorCode};

use super::arena::NodeRecord;
use super::outline::{
    CT_BUTTON, CT_CHECK_BOX, CT_COMBO_BOX, CT_DOCUMENT, CT_EDIT, CT_GROUP, CT_HYPERLINK, CT_IMAGE,
    CT_LIST_ITEM, CT_MENU_ITEM, CT_PANE, CT_RADIO_BUTTON, CT_SLIDER, CT_SPINNER, CT_TAB_ITEM,
    CT_TEXT, CT_TREE_ITEM, CT_WINDOW,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MatchTier {
    AutomationId,
    ExactNameRole,
    SubstringRole,
    NameOnly,
}

impl MatchTier {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::AutomationId => "automation_id",
            Self::ExactNameRole => "exact",
            Self::SubstringRole => "substring",
            Self::NameOnly => "name_only",
        }
    }
}

/// Map a role filter string to UIA `ControlType` raw value.
pub(crate) fn parse_role_raw(role: &str) -> Result<i32, CommandError> {
    match role.trim().to_ascii_lowercase().as_str() {
        "button" => Ok(CT_BUTTON),
        "edit" | "textbox" | "textfield" => Ok(CT_EDIT),
        "combobox" | "select" => Ok(CT_COMBO_BOX),
        "checkbox" => Ok(CT_CHECK_BOX),
        "radiobutton" | "radio" => Ok(CT_RADIO_BUTTON),
        "menuitem" => Ok(CT_MENU_ITEM),
        // Agents often say "link"; UIA control type is Hyperlink.
        "hyperlink" | "link" | "a" => Ok(CT_HYPERLINK),
        "tabitem" | "tab" => Ok(CT_TAB_ITEM),
        "listitem" | "option" => Ok(CT_LIST_ITEM),
        "treeitem" => Ok(CT_TREE_ITEM),
        "slider" => Ok(CT_SLIDER),
        "spinner" => Ok(CT_SPINNER),
        "document" => Ok(CT_DOCUMENT),
        "pane" => Ok(CT_PANE),
        "window" => Ok(CT_WINDOW),
        other => Err(CommandError::new(
            ErrorCode::InvalidInput,
            format!("Unsupported role filter: {other}"),
        )),
    }
}

pub(crate) fn select_query_matches(
    records: &[(usize, NodeRecord)],
    name_exact: Option<&str>,
    name_contains: Option<&str>,
    automation_id: Option<&str>,
    role_filter: Option<i32>,
) -> (MatchTier, Vec<(usize, NodeRecord)>) {
    if let Some(auto_id) = automation_id {
        let matches: Vec<_> = records
            .iter()
            .filter(|(_, r)| r.automation_id == auto_id)
            .filter(|(_, r)| role_matches(r, role_filter))
            .cloned()
            .collect();
        if !matches.is_empty() {
            return (MatchTier::AutomationId, matches);
        }
        if name_exact.is_none() && name_contains.is_none() {
            return (MatchTier::AutomationId, Vec::new());
        }
    }

    let name_lower = name_exact.or(name_contains).unwrap_or("");
    if name_lower.is_empty() {
        let role_only: Vec<_> = records
            .iter()
            .filter(|(_, r)| role_matches(r, role_filter))
            .cloned()
            .collect();
        return (MatchTier::SubstringRole, role_only);
    }

    if let Some(exact) = name_exact {
        let exact_role: Vec<_> = records
            .iter()
            .filter(|(_, r)| role_matches(r, role_filter) && r.name.to_ascii_lowercase() == exact)
            .cloned()
            .collect();
        if !exact_role.is_empty() {
            return (MatchTier::ExactNameRole, exact_role);
        }
    }

    let needle = name_contains.or(name_exact).unwrap_or(name_lower);
    let substring_role: Vec<_> = records
        .iter()
        .filter(|(_, r)| {
            role_matches(r, role_filter) && r.name.to_ascii_lowercase().contains(needle)
        })
        .cloned()
        .collect();
    if !substring_role.is_empty() {
        return (MatchTier::SubstringRole, substring_role);
    }

    let name_only: Vec<_> = records
        .iter()
        .filter(|(_, r)| r.name.to_ascii_lowercase().contains(needle))
        .cloned()
        .collect();
    (MatchTier::NameOnly, name_only)
}

pub(crate) fn role_matches(record: &NodeRecord, role_filter: Option<i32>) -> bool {
    match role_filter {
        Some(role) => record.control_type_raw == role,
        None => true,
    }
}

pub(crate) fn find_record_priority(
    record: &NodeRecord,
    scope_depth: Option<u32>,
) -> (i32, i32, i32, i32) {
    let offscreen = if record.offscreen { 1 } else { 0 };
    let disabled = if record.enabled { 0 } else { 1 };
    let role = match record.control_type_raw {
        CT_HYPERLINK => 0,
        CT_BUTTON => 1,
        CT_LIST_ITEM => 2,
        CT_MENU_ITEM => 3,
        CT_TAB_ITEM => 4,
        CT_TREE_ITEM => 5,
        CT_EDIT => 6,
        CT_COMBO_BOX => 7,
        CT_GROUP => 40,
        CT_TEXT => 50,
        CT_IMAGE => 55,
        _ => 20,
    };
    let distance = match scope_depth {
        Some(scope) => (record.depth as i32 - scope as i32).abs(),
        None => record.depth as i32,
    };
    (role, offscreen, disabled, distance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_role_accepts_common_aliases() {
        assert_eq!(parse_role_raw("link").unwrap(), CT_HYPERLINK);
        assert_eq!(parse_role_raw("Hyperlink").unwrap(), CT_HYPERLINK);
        assert_eq!(parse_role_raw("textbox").unwrap(), CT_EDIT);
        assert_eq!(parse_role_raw("tab").unwrap(), CT_TAB_ITEM);
        assert!(parse_role_raw("banana").is_err());
    }

    #[test]
    fn find_match_tiers_are_deterministic() {
        let records = vec![
            (
                0,
                NodeRecord {
                    parent: None,
                    children: vec![],
                    runtime_id: vec![1],
                    automation_id: String::new(),
                    name: "Save As".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: CT_BUTTON,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
            ),
            (
                1,
                NodeRecord {
                    parent: None,
                    children: vec![],
                    runtime_id: vec![2],
                    automation_id: String::new(),
                    name: "Save".to_string(),
                    role: Some("Button".to_string()),
                    control_type_raw: CT_BUTTON,
                    enabled: true,
                    offscreen: false,
                    rect: None,
                    value: None,
                    ancestor_chain: vec![],
                    depth: 1,
                },
            ),
        ];
        let (tier, matches) =
            select_query_matches(&records, None, Some("sav"), None, Some(CT_BUTTON));
        assert_eq!(tier, MatchTier::SubstringRole);
        assert_eq!(matches.len(), 2);

        let (tier, matches) =
            select_query_matches(&records, None, Some("save"), None, Some(CT_EDIT));
        assert_eq!(tier, MatchTier::NameOnly);
        assert_eq!(matches.len(), 2);

        let (tier, matches) =
            select_query_matches(&records, Some("save"), None, None, Some(CT_BUTTON));
        assert_eq!(tier, MatchTier::ExactNameRole);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].1.name, "Save");
    }

    #[test]
    fn find_priority_prefers_closer_to_scope() {
        let near = NodeRecord {
            parent: Some(0),
            children: vec![],
            runtime_id: vec![1],
            automation_id: String::new(),
            name: "Ok".to_string(),
            role: Some("Button".to_string()),
            control_type_raw: CT_BUTTON,
            enabled: true,
            offscreen: false,
            rect: None,
            value: None,
            ancestor_chain: vec![],
            depth: 2,
        };
        let far = NodeRecord {
            depth: 8,
            ..near.clone()
        };
        let near_p = find_record_priority(&near, Some(2));
        let far_p = find_record_priority(&far, Some(2));
        assert!(near_p < far_p);
    }
}
