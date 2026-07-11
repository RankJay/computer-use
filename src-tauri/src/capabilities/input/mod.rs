//! Mouse and keyboard input synthesis behind [`InputSynthesizer`].

mod commands;
mod keys;
mod synthesizer;
mod types;

#[cfg(windows)]
mod win32;

#[cfg(not(windows))]
mod unsupported;

#[cfg(test)]
mod recording;

pub use commands::{
    hotkey, key_down, key_press, key_up, mouse_click, mouse_down, mouse_drag, mouse_hover,
    mouse_move, mouse_scroll, mouse_up,
};

use synthesizer::InputSynthesizer;

/// Process-wide input synthesizer. Single `#[cfg]` switch for the adapter.
pub fn synthesizer() -> &'static dyn InputSynthesizer {
    #[cfg(windows)]
    {
        static SYNTH: win32::Win32InputSynthesizer = win32::Win32InputSynthesizer;
        &SYNTH
    }
    #[cfg(not(windows))]
    {
        static SYNTH: unsupported::UnsupportedInputSynthesizer =
            unsupported::UnsupportedInputSynthesizer;
        &SYNTH
    }
}
