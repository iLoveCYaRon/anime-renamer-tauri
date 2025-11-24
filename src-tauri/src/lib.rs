use std::fs;
use std::path::Path;

// 文件信息结构体
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_video: bool,
}

// 重命名请求结构体
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RenameRequest {
    pub video_files: Vec<FileInfo>,
    pub subtitle_files: Vec<FileInfo>,
    pub suffix: String,
}

// 重命名响应结构体
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RenameResponse {
    pub success: bool,
    pub message: String,
    pub renamed_files: Vec<String>,
}

// 获取文件扩展名
fn get_extension(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
}

// 判断是否为视频文件
fn is_video_file(filename: &str) -> bool {
    let ext = get_extension(filename);
    let video_extensions = [
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", 
        "m4v", "mpeg", "mpg", "ts", "mts", "m2ts"
    ];
    video_extensions.contains(&ext.as_str())
}

// 判断是否为字幕文件
fn is_subtitle_file(filename: &str) -> bool {
    let ext = get_extension(filename);
    let subtitle_extensions = [
        "srt", "ass", "ssa", "sub", "idx", "vtt", "txt"
    ];
    subtitle_extensions.contains(&ext.as_str())
}

// 处理拖放文件，返回文件信息
#[tauri::command]
async fn get_dropped_files(paths: Vec<String>) -> Result<Vec<FileInfo>, String> {
    let mut file_infos = Vec::new();
    
    for path_str in paths {
        let path = Path::new(&path_str);
        
        // 检查路径是否存在
        if !path.exists() {
            continue;
        }
        
        // 检查是否为文件
        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                let is_video = is_video_file(filename);
                let is_sub = is_subtitle_file(filename);
                
                // 只处理视频和字幕文件
                if is_video || is_sub {
                    file_infos.push(FileInfo {
                        name: filename.to_string(),
                        path: path_str.clone(),
                        is_video,
                    });
                }
            }
        }
    }
    
    Ok(file_infos)
}

// 重命名字幕文件
#[tauri::command]
async fn rename_subtitle_files(request: RenameRequest) -> Result<RenameResponse, String> {
    let mut renamed_files = Vec::new();
    
    // 检查视频文件和字幕文件数量是否匹配
    if request.video_files.len() != request.subtitle_files.len() {
        return Ok(RenameResponse {
            success: false,
            message: format!("视频文件数量({})与字幕文件数量({})不匹配", 
                            request.video_files.len(), request.subtitle_files.len()),
            renamed_files,
        });
    }
    
    // 检查文件是否存在（只有当路径不是简单的文件名时）
    for subtitle_file in &request.subtitle_files {
        let path = Path::new(&subtitle_file.path);
        // 如果路径包含目录分隔符，说明是完整路径，需要检查文件是否存在
        if subtitle_file.path.contains('/') || subtitle_file.path.contains('\\') {
            if !path.exists() {
                return Ok(RenameResponse {
                    success: false,
                    message: format!("字幕文件不存在: {}", subtitle_file.name),
                    renamed_files,
                });
            }
        }
    }
    
    // 逐个处理字幕文件
    for i in 0..request.subtitle_files.len() {
        let video_file = &request.video_files[i];
        let subtitle_file = &request.subtitle_files[i];
        
        // 获取视频文件名（不含扩展名）
        let video_filename = Path::new(&video_file.name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&video_file.name)
            .to_string();
        
        // 获取字幕文件扩展名
        let subtitle_ext = get_extension(&subtitle_file.name);
        
        // 构建新的文件名
        let new_filename = if request.suffix.is_empty() {
            format!("{}.{}", video_filename, subtitle_ext)
        } else {
            format!("{}.{}.{}", video_filename, request.suffix, subtitle_ext)
        };
        
        // 只有当路径是完整路径时才执行重命名操作
        let subtitle_path = Path::new(&subtitle_file.path);
        if subtitle_file.path.contains('/') || subtitle_file.path.contains('\\') {
            if let Some(parent) = subtitle_path.parent() {
                let new_path = parent.join(&new_filename);
                
                // 检查新路径是否已存在
                if new_path.exists() {
                    return Ok(RenameResponse {
                        success: false,
                        message: format!("目标文件 {} 已存在", new_filename),
                        renamed_files,
                    });
                }
                
                // 执行重命名
                match fs::rename(&subtitle_file.path, &new_path) {
                    Ok(_) => {
                        renamed_files.push(new_filename);
                    },
                    Err(e) => {
                        return Ok(RenameResponse {
                            success: false,
                            message: format!("重命名文件失败: {} - {}", subtitle_file.name, e),
                            renamed_files,
                        });
                    }
                }
            }
        } else {
            // 如果只是文件名，只记录重命名结果，不实际执行文件操作
            renamed_files.push(new_filename);
        }
    }
    
    Ok(RenameResponse {
        success: true,
        message: format!("成功重命名{}个文件", renamed_files.len()),
        renamed_files,
    })
}

use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn pick_files_and_get_info(app: tauri::AppHandle) -> Result<Vec<FileInfo>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter("视频/字幕", &["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "rmvb", "3gp", "srt", "ass", "ssa", "sub", "idx", "vtt", "txt", "smi", "sbv", "dfxp"])
        .blocking_pick_files();   // 多选

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

// 选择文件夹并递归扫描视频/字幕文件
#[derive(serde::Serialize, serde::Deserialize)]
pub struct DirectoryPickResult {
    pub files: Vec<FileInfo>,
    pub canceled: bool,
}

#[tauri::command]
async fn pick_directory_and_get_info(app: tauri::AppHandle) -> Result<DirectoryPickResult, String> {
    let dir = rfd::FileDialog::new().pick_folder();
    let mut infos: Vec<FileInfo> = Vec::new();

    // 递归扫描函数
    fn scan_dir(root: &std::path::Path, infos: &mut Vec<FileInfo>, depth: usize, max_depth: usize) -> std::io::Result<()> {
        for entry in fs::read_dir(root)? {
            let entry = entry?;
            let p = entry.path();
            if p.is_dir() {
                // 深度控制：仅在未超过最大深度时才递归
                if depth < max_depth {
                    scan_dir(&p, infos, depth + 1, max_depth)?;
                }
            } else if p.is_file() {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    let is_video = is_video_file(name);
                    let is_sub = is_subtitle_file(name);
                    if is_video || is_sub {
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

    // 用户取消选择：返回 canceled=true，files 为空
    if dir.is_none() {
        return Ok(DirectoryPickResult { files: Vec::new(), canceled: true });
    }

    if let Some(root) = dir.as_ref() {
        // 仅处理指定目录（不递归子目录），如需递归可将 max_depth > 0
        let max_depth: usize = 0; // 0 表示只扫描当前目录
        if let Err(e) = scan_dir(root.as_path(), &mut infos, 0, max_depth) {
            return Err(format!("扫描文件夹失败: {}", e));
        }
    }

    Ok(DirectoryPickResult { files: infos, canceled: false })
}
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
        pick_directory_and_get_info
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
