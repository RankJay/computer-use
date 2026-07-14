mod wait;

#[cfg(target_os = "macos")]
pub(crate) mod macos_ax;

pub use wait::wait;
