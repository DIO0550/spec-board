pub mod config;
pub mod project;
pub mod project_session;
pub mod state;
pub mod task;
pub mod watcher_event;

use std::sync::Arc;

use crate::state::AppState;

/// Builds and runs the Tauri application with the configured plugins and commands.
///
/// Tauri runtime が終了するまでアプリケーションを実行する（戻り値なし）。
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
            task::delete::delete_task,
            task::move_task::move_task,
            task::preview_filename::preview_task_filename,
            task::preview_markdown::preview_task_markdown,
            task::add_link::add_link,
            task::remove_link::remove_link,
            config::get_columns::get_columns,
            config::config_files::get_config_files,
            config::config_files::regenerate_guide,
            config::config_files::open_config_file,
            config::config_files::reveal_config_folder,
            config::get_labels::get_labels,
            config::update_columns::update_columns,
            config::create_label::create_label,
            config::update_label::update_label,
            config::delete_label::delete_label,
            config::export_labels::export_labels,
            config::get_milestones::get_milestones,
            config::create_milestone::create_milestone,
            config::update_milestone::update_milestone,
            config::delete_milestone::delete_milestone
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
