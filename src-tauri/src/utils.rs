use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn settings_path() -> Result<PathBuf, String> {
    let base = dirs::config_dir().ok_or("获取配置目录失败")?;
    let app_dir = base.join("anime-renamer-tauri");
    fs::create_dir_all(&app_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    Ok(app_dir.join("settings.json"))
}

// 获取文件扩展名
pub fn get_extension(filename: &str) -> String {
    Path::new(filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
}

// 判断是否为视频文件
pub fn is_video_file(filename: &str) -> bool {
    let ext = get_extension(filename);
    let video_extensions = [
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "ts", "mts", "m2ts",
    ];
    video_extensions.contains(&ext.as_str())
}

// 判断是否为字幕文件
pub fn is_subtitle_file(filename: &str) -> bool {
    let ext = get_extension(filename);
    let subtitle_extensions = ["srt", "ass", "ssa", "sub", "idx", "vtt", "txt"];
    subtitle_extensions.contains(&ext.as_str())
}
