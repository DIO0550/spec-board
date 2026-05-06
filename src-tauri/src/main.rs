// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Starts the desktop application by delegating to the shared Tauri runner.
fn main() {
    spec_board_lib::run();
}
