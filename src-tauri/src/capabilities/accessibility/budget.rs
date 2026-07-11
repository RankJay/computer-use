use std::time::{Duration, Instant};

pub const FIND_MAX_NODES: u32 = 2_500;
pub const SNAPSHOT_MAX_NODES: u32 = 600;
/// Retained for resolve budgets if a DFS fallback is reintroduced.
#[allow(dead_code)]
pub const RESOLVE_MAX_NODES: u32 = 2_500;

#[derive(Debug, Clone, Copy)]
pub struct SearchBudget {
    deadline: Instant,
    max_nodes: u32,
    nodes_visited: u32,
}

impl SearchBudget {
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

    pub fn nodes_visited(&self) -> u32 {
        self.nodes_visited
    }
}
