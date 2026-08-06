/** UI-only display labels for capability tools. Canonical names stay unchanged for the agent. */
const UI_TOOL_LABELS: Readonly<Record<string, string>> = {
  mouse_move: "Surfing through your screen",
  mouse_hover: "Lingering over a spot",
  mouse_click: "Tapping the screen",
  mouse_click_image: "Tapping a spot in the screenshot",
  mouse_scroll: "Gliding through the page",
  mouse_drag: "Sweeping across the screen",
  mouse_down: "Pinning the cursor",
  mouse_up: "Releasing the cursor",

  key_press: "Tapping keys",
  key_down: "Holding a key down",
  key_up: "Lifting a key",
  hotkey: "Striking a shortcut",
  type_text: "Typing text",

  accessibility_snapshot: "Looking through your screen",
  accessibility_query: "Watching what is relevant",
  accessibility_find_element: "Hunting for an element",
  accessibility_wait: "Waiting for the screen to settle",
  accessibility_get_text: "Reading the screen's words",
  accessibility_get_focused: "Noticing what's in focus",
  accessibility_element_at_point: "Studying a point on screen",
  accessibility_inspect: "Peering into an element",
  accessibility_get_selection: "Seeing what's selected",
  accessibility_click: "Touching an element",
  accessibility_right_click_element: "Opening a quiet menu",
  accessibility_set_value: "Writing into a field",
  accessibility_get_value: "Reading a field",
  accessibility_scroll_element: "Sliding through a panel",
  accessibility_invoke_action: "Nudging an action",
  accessibility_send_keys: "Typing into the app",
  accessibility_focus: "Drawing focus to an element",

  read_file: "Reading a file",
  write_file: "Writing a file",
  patch_file: "Editing a file",
  read_directory: "Browsing a folder",
  search_files: "Searching the workspace",
  create_directory: "Making a folder",
  delete_path: "Removing a path",
  move_path: "Moving something",
  duplicate_path: "Making a copy",
  stat_path: "Checking file details",

  run_shell: "Running a command",
  launch: "Opening an app",
  process_list: "Surveying running apps",
  process_info: "Checking a process",
  process_kill: "Stopping a process",
  get_env: "Reading an environment variable",
  set_env: "Setting an environment variable",
  get_system_info: "Checking the machine",

  read_clipboard: "Reading the clipboard",
  write_clipboard: "Copying to the clipboard",
  read_clipboard_html: "Reading rich clipboard content",
  write_clipboard_html: "Copying rich content",
  read_clipboard_image: "Reading a clipboard image",
  write_clipboard_image: "Copying an image",

  window_list: "Surveying open windows",
  get_active_window: "Noticing the front window",
  window_focus: "Bringing a window forward",
  window_move: "Sliding a window",
  window_resize: "Reshaping a window",
  window_state: "Changing a window's state",

  screenshot: "Taking a screenshot",
  screenshot_zoom: "Zooming into the screenshot",

  wait: "Pausing for a moment",

  web_search: "Searching on web",
};

/** Human-readable label for chat/status UI. Falls back to the canonical tool name. */
export function uiToolLabel(toolName: string): string {
  return UI_TOOL_LABELS[toolName] ?? toolName;
}
