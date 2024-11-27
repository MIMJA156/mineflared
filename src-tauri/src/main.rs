// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    os::windows::process::CommandExt,
    process::{Child, Command},
};

static mut GLB_CHILD_VEC: Vec<Child> = Vec::new();

#[tauri::command]
fn run_command(command: String, args: String) {
    println!("{} {}", command, args);

    let mut command_process = Command::new(command);
    command_process.args(args.split(" "));
    command_process.creation_flags(0x08000000);
    let child_process = command_process.spawn().expect("process failed to execute");

    unsafe {
        GLB_CHILD_VEC.push(child_process);
    }
}

#[tauri::command]
fn stop_current_command() {
    unsafe {
        for child in GLB_CHILD_VEC.iter_mut() {
            child.kill().expect("Failed to kill child process");
            child.wait().expect("Failed to wait for child process");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_command, stop_current_command])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
