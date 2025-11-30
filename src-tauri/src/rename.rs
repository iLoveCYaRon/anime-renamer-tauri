use std::{fs, path::Path};

use crate::{
    types::{FileInfo, RenameRequest, RenameResponse},
    utils::{get_extension, is_subtitle_file, is_video_file},
};

#[tauri::command]
pub async fn get_dropped_files(paths: Vec<String>) -> Result<Vec<FileInfo>, String> {
    let mut file_infos = Vec::new();

    for path_str in paths {
        let path = Path::new(&path_str);
        if !path.exists() {
            continue;
        }
        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                let is_video = is_video_file(filename);
                let is_sub = is_subtitle_file(filename);
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
pub async fn rename_subtitle_files(request: RenameRequest) -> Result<RenameResponse, String> {
    let mut renamed_files = Vec::new();

    // 检查视频文件与字幕文件数量是否匹配
    if request.video_files.len() != request.subtitle_files.len() {
        return Ok(RenameResponse {
            success: false,
            message: format!(
                "视频文件数量({})与字幕文件数量({})不匹配",
                request.video_files.len(),
                request.subtitle_files.len()
            ),
            renamed_files,
        });
    }

    // 检查字幕文件是否存在（仅在给出完整路径时检查）
    for subtitle_file in &request.subtitle_files {
        let path = Path::new(&subtitle_file.path);
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

    // ���������Ļ�ļ�
    for i in 0..request.subtitle_files.len() {
        let video_file = &request.video_files[i];
        let subtitle_file = &request.subtitle_files[i];

        // 提取视频文件名（去掉扩展名）
        let video_filename = Path::new(&video_file.name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&video_file.name)
            .to_string();

        // 提取字幕扩展名
        let subtitle_ext = get_extension(&subtitle_file.name);

        // 生成新的文件名
        let new_filename = if request.suffix.is_empty() {
            format!("{}.{}", video_filename, subtitle_ext)
        } else {
            format!("{}.{}.{}", video_filename, request.suffix, subtitle_ext)
        };

        // 只有路径为完整路径时才执行实际重命名
        let subtitle_path = Path::new(&subtitle_file.path);
        if subtitle_file.path.contains('/') || subtitle_file.path.contains('\\') {
            if let Some(parent) = subtitle_path.parent() {
                let new_path = parent.join(&new_filename);

                // 目标路径是否已存在
                if new_path.exists() {
                    return Ok(RenameResponse {
                        success: false,
                        message: format!("目标文件 {} 已存在", new_filename),
                        renamed_files,
                    });
                }

                // ִ��������
                match fs::rename(&subtitle_file.path, &new_path) {
                    Ok(_) => {
                        renamed_files.push(new_filename);
                    }
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
            // 仅提供文件名时，只记录结果，不执行实际重命名
            renamed_files.push(new_filename);
        }
    }

    Ok(RenameResponse {
        success: true,
        message: format!("成功重命名{}个文件", renamed_files.len()),
        renamed_files,
    })
}
