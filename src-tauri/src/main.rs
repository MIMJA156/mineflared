// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs::File, path::Path};

use flate2::read::GzDecoder;
use sysinfo::System;
use tar::Archive;

#[tauri::command]
fn kill_process(process_name: String) {
    let s = System::new_all();
    for (_, process) in s.processes() {
        if let Some(name) = process.name().to_str() {
            if name == process_name {
                process.kill();
                println!("killed item with name {}", name)
            }
        }
    }
}

#[tauri::command]
fn uncompress_tarball(path: String) {
    let compressed_file_path = Path::new(&path);
    if let Some(parent_dir) = compressed_file_path.parent() {
        let tar_gz = File::open(&path).expect("Failed to open the tarball");
        let tar = GzDecoder::new(tar_gz);
        let mut archive = Archive::new(tar);
        archive
            .unpack(parent_dir)
            .expect("Failed to unpack the archive");
    } else {
        eprintln!("Could not determine the parent directory of the provided path");
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![kill_process, uncompress_tarball])
        .run(tauri::generate_context!())
        .expect("Error while running tauri application");
}
