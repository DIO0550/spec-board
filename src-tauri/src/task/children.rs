//! children 派生ドメイン。
//!
//! parent 検証を委譲呼び出しした上で、parent 逆引きで各 Task の `children` を埋める。

use crate::task::parse::TaskParseError;
use crate::task::path_lookup::{append_child_to_parent, clear_children, task_lookup_index};
use crate::task::task_index::{validate_parent_hierarchy, Task};

/// 全 Task の parent 参照を検証し、親 Task の children を parent 逆引きで構築する。
pub(super) fn build_children(tasks: Vec<Task>) -> Result<Vec<Task>, TaskParseError> {
    let mut tasks = validate_parent_hierarchy(tasks)?;
    clear_children(&mut tasks);
    let parent_index = task_lookup_index(&tasks);

    for child_index in 0..tasks.len() {
        append_child_to_parent(child_index, &mut tasks, &parent_index);
    }

    Ok(tasks)
}

#[cfg(test)]
#[path = "children_tests.rs"]
mod children_tests;
