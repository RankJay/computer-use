//! Mouse and keyboard input synthesis behind [`InputSynthesizer`].

mod commands;
pub(crate) mod keys;
mod synthesizer;
mod types;

#[cfg(windows)]
mod win32;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(any(windows, target_os = "macos")))]
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
    #[cfg(target_os = "macos")]
    {
        static SYNTH: macos::MacosInputSynthesizer = macos::MacosInputSynthesizer::new();
        &SYNTH
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        static SYNTH: unsupported::UnsupportedInputSynthesizer =
            unsupported::UnsupportedInputSynthesizer;
        &SYNTH
    }
}
