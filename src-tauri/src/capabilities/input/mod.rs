//! Shared Win32 SendInput helpers for Mouse and Keyboard toolsets.

mod keys;
mod send_input;

pub use send_input::{
    hotkey, key_down, key_press, key_up, mouse_button_down, mouse_button_up, mouse_click,
    mouse_drag, mouse_hover, mouse_move, mouse_scroll, MouseButton,
};
