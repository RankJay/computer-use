use std::time::{Duration, Instant};

pub const FIND_MAX_NODES: u32 = 20_000;
/// Local walk after bulk BuildCache is memory-bound; cap protects monster trees.
pub const SNAPSHOT_MAX_NODES: u32 = 20_000;
/// Cap for fingerprint DFS resolve (wired on macOS AX; UIA follow-up).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const RESOLVE_MAX_NODES: u32 = 2_500;

#[derive(Debug, Clone, Copy)]
pub struct SearchBudget {
    deadline: Instant,
    max_nodes: u32,
    nodes_visited: u32,
}

impl SearchBudget {
    #[allow(dead_code)]
    pub fn for_duration(duration: Duration, max_nodes: u32) -> Self {
        Self {
            deadline: Instant::now() + duration,
            max_nodes,
            nodes_visited: 0,
        }
    }

    pub fn until(deadline: Instant, max_nodes: u32) -> Self {
        Self {
            deadline,
            max_nodes,
            nodes_visited: 0,
        }
    }

    pub fn exhausted(&self) -> bool {
        Instant::now() >= self.deadline || self.nodes_visited >= self.max_nodes
    }

    pub fn visit_soft(&mut self) -> bool {
        self.nodes_visited = self.nodes_visited.saturating_add(1);
        !self.exhausted()
    }

    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub fn nodes_visited(&self) -> u32 {
        self.nodes_visited
    }
}
