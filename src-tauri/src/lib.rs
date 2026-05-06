pub mod config;
pub mod frontmatter;
pub mod task_index;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
/// Returns a greeting string for the given name.
///
/// This command is registered with Tauri so the frontend can invoke it through IPC.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Builds and runs the Tauri application with the configured plugins and commands.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
