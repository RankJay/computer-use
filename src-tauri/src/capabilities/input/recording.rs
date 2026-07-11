use std::sync::Mutex;

use crate::capabilities::error::{CommandError, OkResult};

use super::keys::Key;
use super::synthesizer::InputSynthesizer;
use super::types::MouseButton;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecordedEvent {
    MouseMove {
        x: i32,
        y: i32,
    },
    MouseDown {
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    },
    MouseUp {
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    },
    MouseClick {
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    },
    MouseScroll {
        dx: i32,
        dy: i32,
        x: Option<i32>,
        y: Option<i32>,
    },
    MouseDrag {
        x0: i32,
        y0: i32,
        x1: i32,
        y1: i32,
        button: MouseButton,
        steps: u32,
    },
    MouseHover {
        x: i32,
        y: i32,
        ms: u64,
    },
    KeyDown(Key),
    KeyUp(Key),
}

/// Test adapter that records synthesizer calls as discrete events.
pub struct RecordingSynthesizer {
    events: Mutex<Vec<RecordedEvent>>,
}

impl RecordingSynthesizer {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
        }
    }

    pub fn events(&self) -> Vec<RecordedEvent> {
        self.events.lock().expect("poisoned").clone()
    }

    fn push(&self, event: RecordedEvent) {
        self.events.lock().expect("poisoned").push(event);
    }
}

impl Default for RecordingSynthesizer {
    fn default() -> Self {
        Self::new()
    }
}

impl InputSynthesizer for RecordingSynthesizer {
    fn mouse_move(&self, x: i32, y: i32) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseMove { x, y });
        Ok(OkResult { ok: true })
    }

    fn mouse_button_down(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseDown { button, x, y });
        Ok(OkResult { ok: true })
    }

    fn mouse_button_up(
        &self,
        button: MouseButton,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseUp { button, x, y });
        Ok(OkResult { ok: true })
    }

    fn mouse_click(
        &self,
        button: MouseButton,
        count: u32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        for _ in 0..count {
            self.push(RecordedEvent::MouseClick { button, x, y });
        }
        Ok(OkResult { ok: true })
    }

    fn mouse_scroll(
        &self,
        dx: i32,
        dy: i32,
        x: Option<i32>,
        y: Option<i32>,
    ) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseScroll { dx, dy, x, y });
        Ok(OkResult { ok: true })
    }

    fn mouse_drag(
        &self,
        x0: i32,
        y0: i32,
        x1: i32,
        y1: i32,
        button: MouseButton,
        steps: u32,
    ) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseDrag {
            x0,
            y0,
            x1,
            y1,
            button,
            steps,
        });
        Ok(OkResult { ok: true })
    }

    fn mouse_hover(&self, x: i32, y: i32, ms: u64) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::MouseHover { x, y, ms });
        Ok(OkResult { ok: true })
    }

    fn key_down(&self, key: Key) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::KeyDown(key));
        Ok(OkResult { ok: true })
    }

    fn key_up(&self, key: Key) -> Result<OkResult, CommandError> {
        self.push(RecordedEvent::KeyUp(key));
        Ok(OkResult { ok: true })
    }

    fn key_press(&self, key: Key, count: u32) -> Result<OkResult, CommandError> {
        for _ in 0..count {
            self.push(RecordedEvent::KeyDown(key));
            self.push(RecordedEvent::KeyUp(key));
        }
        Ok(OkResult { ok: true })
    }

    fn hotkey(&self, keys: &[Key]) -> Result<OkResult, CommandError> {
        for key in keys {
            self.push(RecordedEvent::KeyDown(*key));
        }
        for key in keys.iter().rev() {
            self.push(RecordedEvent::KeyUp(*key));
        }
        Ok(OkResult { ok: true })
    }
}
