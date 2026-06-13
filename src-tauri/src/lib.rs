pub mod config;
pub mod project;
pub mod state;
pub mod task;
pub mod watcher_event;

use std::sync::Arc;

use crate::state::AppState;

/// Builds and runs the Tauri application with the configured plugins and commands.
///
/// @returns 戻り値なし。Tauri runtime が終了するまでアプリケーションを実行する。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            project::open::open_project,
            task::get::get_tasks,
            task::create::create_task,
            task::update::update_task,
            task::add_link::add_link,
            task::remove_link::remove_link,
            config::get_columns::get_columns,
            config::get_labels::get_labels,
            config::update_card_order::update_card_order,
            config::update_columns::update_columns,
            config::create_label::create_label,
            config::update_label::update_label,
            config::delete_label::delete_label,
            config::get_milestones::get_milestones,
            config::create_milestone::create_milestone,
            config::update_milestone::update_milestone,
            config::delete_milestone::delete_milestone
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
