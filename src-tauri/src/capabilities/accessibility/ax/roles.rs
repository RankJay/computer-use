//! AX role strings → portable UIA-style `CT_*` ints and outline labels.

use super::super::outline::{
    CT_BUTTON, CT_CHECK_BOX, CT_COMBO_BOX, CT_DOCUMENT, CT_EDIT, CT_GROUP, CT_HYPERLINK, CT_IMAGE,
    CT_LIST_ITEM, CT_MENU_ITEM, CT_PANE, CT_RADIO_BUTTON, CT_SLIDER, CT_SPINNER, CT_TAB_ITEM,
    CT_TEXT, CT_TREE_ITEM, CT_WINDOW,
};

/// Map an AX role (e.g. `AXButton`) to `(control_type_raw, outline_label)`.
pub(super) fn map_ax_role(role: &str) -> (i32, &'static str) {
    match role {
        "AXButton" => (CT_BUTTON, "Button"),
        "AXCheckBox" => (CT_CHECK_BOX, "CheckBox"),
        "AXRadioButton" => (CT_RADIO_BUTTON, "RadioButton"),
        "AXPopUpButton" | "AXComboBox" => (CT_COMBO_BOX, "ComboBox"),
        "AXTextField" | "AXTextArea" | "AXSearchField" => (CT_EDIT, "Edit"),
        "AXStaticText" => (CT_TEXT, "Text"),
        "AXLink" => (CT_HYPERLINK, "Hyperlink"),
        "AXImage" => (CT_IMAGE, "Image"),
        "AXList" => (CT_PANE, "List"),
        "AXListItem" => (CT_LIST_ITEM, "ListItem"),
        "AXMenuItem" | "AXMenuBarItem" => (CT_MENU_ITEM, "MenuItem"),
        "AXTab" => (CT_TAB_ITEM, "TabItem"),
        "AXSlider" => (CT_SLIDER, "Slider"),
        "AXIncrementor" | "AXStepper" => (CT_SPINNER, "Spinner"),
        "AXOutline" | "AXOutlineRow" | "AXRow" => (CT_TREE_ITEM, "TreeItem"),
        "AXWindow" => (CT_WINDOW, "Window"),
        "AXScrollArea" | "AXSplitGroup" | "AXLayoutArea" | "AXDrawer" | "AXSheet" => {
            (CT_PANE, "Pane")
        }
        "AXGroup" | "AXToolbar" | "AXTabGroup" | "AXMenuBar" | "AXMenu" | "AXRadioGroup" => {
            (CT_GROUP, "Group")
        }
        "AXWebArea" => (CT_DOCUMENT, "Document"),
        "AXApplication" => (CT_WINDOW, "Window"),
        _ => (CT_GROUP, "Group"),
    }
}

pub(super) fn should_skip_role_allow_text(role: &str) -> bool {
    matches!(
        role,
        "AXImage" | "AXSeparator" | "AXSplitter" | "AXHelpTag" | "AXBusyIndicator"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_common_roles() {
        assert_eq!(map_ax_role("AXButton"), (CT_BUTTON, "Button"));
        assert_eq!(map_ax_role("AXTextField"), (CT_EDIT, "Edit"));
        assert_eq!(map_ax_role("AXTextArea"), (CT_EDIT, "Edit"));
        assert_eq!(map_ax_role("AXStaticText"), (CT_TEXT, "Text"));
        assert_eq!(map_ax_role("AXLink"), (CT_HYPERLINK, "Hyperlink"));
        assert_eq!(map_ax_role("AXUnknownThing"), (CT_GROUP, "Group"));
    }
}
