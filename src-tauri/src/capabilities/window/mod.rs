mod active;
mod focus;
mod geometry;
mod list;
mod resize;
mod state;
mod types;

#[cfg(target_os = "windows")]
mod platform;

#[cfg(not(target_os = "windows"))]
mod platform;

pub use active::get_active_window;
pub use focus::window_focus;
pub use geometry::window_move;
pub use list::window_list;
pub use resize::window_resize;
pub use state::window_state;
