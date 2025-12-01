use std::{env, fs, io::Write, path::PathBuf};

use crate::{types::Settings, utils::settings_path};

fn default_settings() -> Settings {
    Settings {
        episode_regex: "\\[(\\d{2})\\]".to_string(),
        model_url: "http://localhost:11434/v1/chat/completions".to_string(),
        model_name: "qwen/qwen3-vl-8b".to_string(),
    }
}

fn legacy_settings_path() -> Result<PathBuf, String> {
    let cwd = env::current_dir().map_err(|e| format!("获取当前工作目录失败: {}", e))?;
    Ok(cwd.join("settings.json"))
}

#[tauri::command]
pub(crate) async fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    let target = if path.exists() {
        path
    } else {
        let legacy = legacy_settings_path()?;
        if legacy.exists() {
            legacy
        } else {
            return Ok(default_settings());
        }
    };
    let content = fs::read_to_string(&target).map_err(|e| format!("读取设置失败: {}", e))?;
    let s: Settings = serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {}", e))?;
    Ok(s)
}

#[tauri::command]
pub(crate) async fn save_settings(settings: Settings) -> Result<bool, String> {
    let path = settings_path()?;
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {}", e))?;
    let mut f = fs::File::create(&path).map_err(|e| format!("创建设置文件失败: {}", e))?;
    f.write_all(json.as_bytes())
        .map_err(|e| format!("保存设置失败：{}", e))?;
    Ok(true)
}
