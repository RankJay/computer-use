//! Worker-thread-local flat tree from the last snapshot per window.
//! COM/AX cache results are extracted into these records, then dropped.

#[derive(Debug, Clone)]
pub struct NodeRecord {
    #[allow(dead_code)] // useful for future parent walks / diffing
    pub parent: Option<u32>,
    pub children: Vec<u32>,
    pub runtime_id: Vec<i32>,
    pub automation_id: String,
    pub name: String,
    pub role: Option<String>,
    pub control_type_raw: i32,
    pub enabled: bool,
    pub offscreen: bool,
    pub rect: Option<(i32, i32, i32, i32)>,
    pub value: Option<String>,
    /// Ancestor labels as `"Role:name"` from root toward parent.
    pub ancestor_chain: Vec<String>,
    pub depth: u32,
}

#[derive(Debug, Clone, Default)]
pub struct ElementArena {
    pub generation: u32,
    #[allow(dead_code)]
    pub process_id: u32,
    pub nodes: Vec<NodeRecord>,
}

impl ElementArena {
    pub fn find_by_runtime_id(&self, runtime_id: &[i32]) -> Option<usize> {
        if runtime_id.is_empty() {
            return None;
        }
        self.nodes
            .iter()
            .position(|node| node.runtime_id == runtime_id)
    }
}
