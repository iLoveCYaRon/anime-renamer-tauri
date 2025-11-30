use std::{fs, io::Write};

use crate::{types::Settings, utils::settings_path};

#[tauri::command]
pub(crate) async fn load_settings() -> Result<Settings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(Settings {
            episode_regex: "\\[(\\d{2})\\]".to_string(),
            model_url: "http://localhost:11434/v1/chat/completions".to_string(),
            model_name: "qwen2.5:7b".to_string(),
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取设置失败: {}", e))?;
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
