// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::thread::{self, JoinHandle};

static mut CURRENT_CLOUDFLARED_THREAD: Option<JoinHandle<()>> = None;
static mut THREAD_IS_ALLOWED: bool = false;

#[tauri::command]
fn run_command(command: String, args: String) {
    println!("{}", command);

    unsafe {
        THREAD_IS_ALLOWED = true;
        CURRENT_CLOUDFLARED_THREAD = Some(thread::spawn(move || {
            let mut command = Command::new(command);
            command.args(args.split(" "));
            let mut child_process = command.spawn().expect("process failed to execute");

            while THREAD_IS_ALLOWED == true {}
            _ = child_process.kill();
            _ = child_process.wait();
        }));
    };
}

#[tauri::command]
fn stop_current_command() {
    unsafe {
        THREAD_IS_ALLOWED = false;
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_command, stop_current_command])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
