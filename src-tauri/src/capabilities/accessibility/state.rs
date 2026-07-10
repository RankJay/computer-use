use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::capabilities::path_utils::CommandError;

use super::types::MAX_GENERATIONS_PER_HWND;

#[derive(Debug, Clone)]
pub struct StoredElement {
    pub hwnd: i64,
    pub runtime_id: Vec<i32>,
    pub process_id: u32,
    pub name: String,
    pub role: Option<String>,
}

#[derive(Debug, Clone)]
struct GenerationEntry {
    id: u32,
    elements: HashMap<String, StoredElement>,
}

#[derive(Debug, Default)]
struct HwndState {
    next_generation: u32,
    generations: VecDeque<GenerationEntry>,
}

#[derive(Debug, Clone, Default)]
pub struct SnapshotStore {
    inner: Arc<Mutex<StoreInner>>,
}

#[derive(Debug, Default)]
struct StoreInner {
    windows: HashMap<i64, HwndState>,
    touched_processes: HashMap<u32, bool>,
    degraded_processes: HashMap<u32, Instant>,
    timeout_counts: HashMap<u32, u32>,
}

impl SnapshotStore {
    pub fn begin_generation(&self, hwnd: i64) -> u32 {
        let mut inner = self.inner.lock().expect("snapshot store poisoned");
        let state = inner.windows.entry(hwnd).or_default();
        state.next_generation = state.next_generation.saturating_add(1);
        let generation = state.next_generation;
        state.generations.push_back(GenerationEntry {
            id: generation,
            elements: HashMap::new(),
        });
        while state.generations.len() > MAX_GENERATIONS_PER_HWND {
            state.generations.pop_front();
        }
        generation
    }

    pub fn store_element(
        &self,
        hwnd: i64,
        generation: u32,
        reference: String,
        runtime_id: Vec<i32>,
        process_id: u32,
        name: String,
        role: Option<String>,
    ) {
        let mut inner = self.inner.lock().expect("snapshot store poisoned");
        let Some(state) = inner.windows.get_mut(&hwnd) else {
            return;
        };
        let Some(entry) = state.generations.iter_mut().find(|g| g.id == generation) else {
            return;
        };
        entry.elements.insert(
            reference.clone(),
            StoredElement {
                hwnd,
                runtime_id,
                process_id,
                name,
                role,
            },
        );
    }

    pub fn resolve_ref(&self, reference: &str) -> Option<StoredElement> {
        let inner = self.inner.lock().expect("snapshot store poisoned");
        for state in inner.windows.values() {
            for generation in state.generations.iter().rev() {
                if let Some(element) = generation.elements.get(reference) {
                    return Some(element.clone());
                }
            }
        }
        None
    }

    pub fn resolve_ref_or_stale(&self, reference: &str) -> Result<StoredElement, CommandError> {
        if let Some(element) = self.resolve_ref(reference) {
            return Ok(element);
        }
        if reference.contains('@') {
            return Err(CommandError::new(
                "stale_reference",
                "Reference is stale or unknown; take a new snapshot or find_element call",
            ));
        }
        Err(CommandError::new(
            "invalid_reference",
            "Reference must look like e14@3",
        ))
    }

    pub fn is_process_degraded(&self, process_id: u32) -> bool {
        let inner = self.inner.lock().expect("snapshot store poisoned");
        inner
            .degraded_processes
            .get(&process_id)
            .is_some_and(|until| Instant::now() < *until)
    }

    pub fn mark_process_timeout(&self, process_id: u32) {
        self.mark_process_timeout_kind(process_id, true);
    }

    pub fn mark_process_find_timeout(&self, process_id: u32) {
        self.mark_process_timeout_kind(process_id, false);
    }

    fn mark_process_timeout_kind(&self, process_id: u32, may_degrade: bool) {
        let mut inner = self.inner.lock().expect("snapshot store poisoned");
        if !may_degrade {
            return;
        }
        let count = inner.timeout_counts.entry(process_id).or_insert(0);
        *count = count.saturating_add(1);
        if *count >= 2 {
            inner.degraded_processes.insert(
                process_id,
                Instant::now() + Duration::from_millis(super::types::DEGRADED_COOLDOWN_MS),
            );
            inner.timeout_counts.remove(&process_id);
        }
    }

    pub fn clear_process_timeout(&self, process_id: u32) {
        let mut inner = self.inner.lock().expect("snapshot store poisoned");
        inner.timeout_counts.remove(&process_id);
    }

    pub fn was_process_touched(&self, process_id: u32) -> bool {
        let inner = self.inner.lock().expect("snapshot store poisoned");
        inner.touched_processes.contains_key(&process_id)
    }

    pub fn is_first_process_touch(&self, process_id: u32) -> bool {
        let mut inner = self.inner.lock().expect("snapshot store poisoned");
        inner.touched_processes.insert(process_id, true).is_none()
    }
}

pub fn make_reference(index: u32, generation: u32) -> String {
    format!("e{index}@{generation}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_last_two_generations() {
        let store = SnapshotStore::default();
        let hwnd = 12345;

        let g1 = store.begin_generation(hwnd);
        store.store_element(
            hwnd,
            g1,
            make_reference(1, g1),
            vec![1, 2],
            100,
            "Compose".to_string(),
            Some("Button".to_string()),
        );
        let g2 = store.begin_generation(hwnd);
        store.store_element(
            hwnd,
            g2,
            make_reference(1, g2),
            vec![3, 4],
            100,
            "Compose".to_string(),
            Some("Button".to_string()),
        );
        let g3 = store.begin_generation(hwnd);
        store.store_element(
            hwnd,
            g3,
            make_reference(1, g3),
            vec![5, 6],
            100,
            "Compose".to_string(),
            Some("Button".to_string()),
        );

        assert!(store.resolve_ref(&make_reference(1, g1)).is_none());
        assert!(store.resolve_ref(&make_reference(1, g2)).is_some());
        assert!(store.resolve_ref(&make_reference(1, g3)).is_some());
    }
}
