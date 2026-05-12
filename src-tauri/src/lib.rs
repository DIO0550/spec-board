pub mod config;
pub mod project;
pub mod state;
pub mod task;
pub mod watcher_event;

use std::sync::Arc;

use crate::state::AppState;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
/// Returns a greeting string for the given name.
///
/// This command is registered with Tauri so the frontend can invoke it through IPC.
///
/// @param name Greeting target name supplied by the frontend IPC caller.
/// @returns Greeting message including the supplied name.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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
            greet,
            project::open::open_project,
            task::get::get_tasks,
            task::create::create_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
