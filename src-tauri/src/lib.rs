mod llm_recognition;
mod rename;
mod settings;
mod types;
mod utils;

use std::fs;

use tauri_plugin_dialog::DialogExt;

use crate::{
    llm_recognition::{
        analyze_filename, batch_analyze_filenames, get_bangumi_subject_detail,
        search_bangumi_subjects,
    },
    rename::{get_dropped_files, rename_subtitle_files},
    settings::{load_settings, save_settings},
    types::{DirectoryPickResult, FileInfo},
    utils::{is_subtitle_file, is_video_file},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_dropped_files,
            rename_subtitle_files,
            pick_files_and_get_info,
            pick_directory_and_get_info,
            analyze_filename,
            batch_analyze_filenames,
            search_bangumi_subjects,
            get_bangumi_subject_detail,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn pick_files_and_get_info(app: tauri::AppHandle) -> Result<Vec<FileInfo>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter(
            "视频/字幕",
            &[
                "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "rmvb", "3gp", "srt",
                "ass", "ssa", "sub", "idx", "vtt", "txt", "smi", "sbv", "dfxp",
            ],
        )
        .blocking_pick_files(); // 多选

    let mut infos = Vec::new();
    if let Some(paths) = files {
        for path in paths {
            let path_buf = path.as_path().unwrap();
            if let Some(name) = path_buf.file_name().and_then(|n| n.to_str()) {
                let is_video = is_video_file(name);
                let is_sub = is_subtitle_file(name);
                if is_video || is_sub {
                    infos.push(FileInfo {
                        name: name.to_string(),
                        path: path_buf.to_string_lossy().to_string(),
                        is_video,
                    });
                }
            }
        }
    }
    Ok(infos)
}

#[tauri::command]
async fn pick_directory_and_get_info(_: tauri::AppHandle) -> Result<DirectoryPickResult, String> {
    let dir = rfd::FileDialog::new().pick_folder();
    let mut infos: Vec<FileInfo> = Vec::new();

    fn scan_dir(root: &std::path::Path, infos: &mut Vec<FileInfo>) -> std::io::Result<()> {
        for entry in fs::read_dir(root)? {
            let entry = entry?;
            let p = entry.path();
            if p.is_dir() {
                continue;
            } else if p.is_file() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    let is_video = is_video_file(name);
                    // 只选择视频文件，不选字幕文件
                    if is_video {
                        infos.push(FileInfo {
                            name: name.to_string(),
                            path: p.to_string_lossy().to_string(),
                            is_video,
                        });
                    }
                }
            }
        }
        Ok(())
    }

    if dir.is_none() {
        return Ok(DirectoryPickResult {
            files: Vec::new(),
            canceled: true,
        });
    }

    if let Some(root) = dir.as_ref() {
        if let Err(e) = scan_dir(root.as_path(), &mut infos) {
            return Err(format!("扫描文件夹失败: {}", e));
        }
    }

    Ok(DirectoryPickResult {
        files: infos,
        canceled: false,
    })
}
