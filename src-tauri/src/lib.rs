use serde_json;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
mod types;
use crate::types::{
    AnimeInfo, BangumiSubject, BangumiSubjectDetail, DirectoryPickResult, FileInfo, LLMRequest,
    LLMResponse, RenameRequest, RenameResponse, Settings,
};

fn settings_path() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("获取当前运行目录失败: {}", e))?;
    Ok(cwd.join("settings.json"))
}

#[tauri::command]
async fn load_settings() -> Result<Settings, String> {
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
async fn save_settings(settings: Settings) -> Result<bool, String> {
    let path = settings_path()?;
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {}", e))?;
    let mut f = fs::File::create(&path).map_err(|e| format!("创建设置文件失败: {}", e))?;
    f.write_all(json.as_bytes())
        .map_err(|e| format!("写入设置失败: {}", e))?;
    Ok(true)
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
        "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "ts", "mts", "m2ts",
    ];
    video_extensions.contains(&ext.as_str())
}

// 判断是否为字幕文件
fn is_subtitle_file(filename: &str) -> bool {
    let ext = get_extension(filename);
    let subtitle_extensions = ["srt", "ass", "ssa", "sub", "idx", "vtt", "txt"];
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
            message: format!(
                "视频文件数量({})与字幕文件数量({})不匹配",
                request.video_files.len(),
                request.subtitle_files.len()
            ),
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
async fn pick_directory_and_get_info(app: tauri::AppHandle) -> Result<DirectoryPickResult, String> {
    let dir = rfd::FileDialog::new().pick_folder();
    let mut infos: Vec<FileInfo> = Vec::new();

    // 递归扫描函数
    fn scan_dir(
        root: &std::path::Path,
        infos: &mut Vec<FileInfo>,
        depth: usize,
        max_depth: usize,
    ) -> std::io::Result<()> {
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
        return Ok(DirectoryPickResult {
            files: Vec::new(),
            canceled: true,
        });
    }

    if let Some(root) = dir.as_ref() {
        // 仅处理指定目录（不递归子目录），如需递归可将 max_depth > 0
        let max_depth: usize = 0; // 0 表示只扫描当前目录
        if let Err(e) = scan_dir(root.as_path(), &mut infos, 0, max_depth) {
            return Err(format!("扫描文件夹失败: {}", e));
        }
    }

    Ok(DirectoryPickResult {
        files: infos,
        canceled: false,
    })
}

// 分析文件名，调用LLM模型
#[tauri::command]
async fn analyze_filename(request: LLMRequest) -> Result<LLMResponse, String> {
    let is_sub = is_subtitle_file(&request.filename);
    let prompt = if is_sub {
        r#"
你是一个动画文件名信息提取器。
输入可能是字幕文件名（如 .ass/.srt/.ssa/.vtt）。
仅需精准提取“动画标题”和“集数”。

请严格返回 JSON，完整字段如下：
{
    "title": "动画标题",
    "season": "季数",
    "episode": "集数",
    "language_tags": "字幕语言标签, 日文使用"JPN",简体中文使用"CHS",繁体中文使用"CHT",其它则留空",
}
季数和集数至少使用两位数字表示
若无法从字幕文件名确定除标题与集数外的字段：
- season 缺失则为 01

只输出 JSON，不要附加说明。
"#.to_string()
    } else {
        r#"
你是一个动画视频文件信息提取专家。
从文件名中提取动画信息并以 JSON 返回。

必须严格返回以下结构：
请严格返回 JSON，完整字段如下：
{
    "title": "动画标题",
    "season": "季数",
    "episode": "集数",
    "codec": "编码格式例如AVC、HEVC等",
    "group": "压制组名称 例如VCB-Studio",
}
季数和集数至少使用两位数字表示
若无法从字幕文件名确定除标题与集数外的字段：
- season 缺失则为 01
只输出 JSON，不要额外说明。
"#.to_string()
    };
    let user_content = if is_sub { format!("这是字幕文件名，请分析并仅确保标题与集数准确：{}", request.filename) } else { format!("请分析这个动画文件名：{}", request.filename) };
    let request_body = serde_json::json!({
        "model": request.model_name,
        "messages": [
            { "role": "system", "content": prompt },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.1,
        "max_tokens": 500
    });

    // 创建HTTP客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 发送请求到LLM模型
    let response = client
        .post(&request.model_url)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("请求LLM模型失败: {}", e))?;

    if !response.status().is_success() {
        return Ok(LLMResponse {
            success: false,
            data: None,
            error: Some(format!("LLM模型返回错误状态码: {}", response.status())),
        });
    }

    // 解析响应
    let response_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析LLM响应失败: {}", e))?;

    // 提取content字段
    let content = response_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("无法从LLM响应中提取内容")?;

    // 尝试解析JSON响应
    match serde_json::from_str::<AnimeInfo>(content) {
        Ok(anime_info) => Ok(LLMResponse {
            success: true,
            data: Some(anime_info),
            error: None,
        }),
        Err(_) => {
            // 如果直接解析失败，尝试清理响应并重新解析
            let cleaned_content = content
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();

            match serde_json::from_str::<AnimeInfo>(cleaned_content) {
                Ok(anime_info) => Ok(LLMResponse {
                    success: true,
                    data: Some(anime_info),
                    error: None,
                }),
                Err(_) => Ok(LLMResponse {
                    success: false,
                    data: None,
                    error: Some(format!("解析LLM响应格式失败: {}", content)),
                }),
            }
        }
    }
}

#[tauri::command]
async fn search_bangumi_subjects(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<BangumiSubject>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let max = limit.unwrap_or(10);
    let encoded = urlencoding::encode(q);
    let url = format!(
        "https://api.bgm.tv/search/subject/{}?type=2&responseGroup=small&max_results={}",
        encoded, max
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求Bangumi失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Bangumi返回错误状态码: {}", resp.status()));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析Bangumi响应失败: {}", e))?;

    let mut items: Vec<BangumiSubject> = Vec::new();
    if let Some(list) = v.get("list").and_then(|x| x.as_array()) {
        for it in list {
            let id = it.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
            let name = it
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let name_cn = it
                .get("name_cn")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            let subject_type = it.get("type").and_then(|x| x.as_i64()).map(|n| n as i32);
            let date = it
                .get("date")
                .or_else(|| it.get("air_date"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            if id != 0 && !name.is_empty() {
                items.push(BangumiSubject {
                    id,
                    name,
                    name_cn,
                    subject_type,
                    date,
                });
            }
        }
    } else if let Some(arr) = v.as_array() {
        for it in arr {
            let id = it.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
            let name = it
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let name_cn = it
                .get("name_cn")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            let subject_type = it.get("type").and_then(|x| x.as_i64()).map(|n| n as i32);
            let date = it
                .get("date")
                .or_else(|| it.get("air_date"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            if id != 0 && !name.is_empty() {
                items.push(BangumiSubject {
                    id,
                    name,
                    name_cn,
                    subject_type,
                    date,
                });
            }
        }
    }

    Ok(items)
}

#[tauri::command]
async fn get_bangumi_subject_detail(id: i64) -> Result<BangumiSubjectDetail, String> {
    let url = format!("https://api.bgm.tv/subject/{}", id);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求Bangumi失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Bangumi返回错误状态码: {}", resp.status()));
    }

    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析Bangumi响应失败: {}", e))?;

    let id_v = v.get("id").and_then(|x| x.as_i64()).unwrap_or(id);
    let name = v
        .get("name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let name_cn = v
        .get("name_cn")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    let cover_url = v
        .get("images")
        .and_then(|imgs| imgs.get("large").or_else(|| imgs.get("common")))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            v.get("cover")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        });

    let episodes = v
        .get("eps")
        .and_then(|x| x.as_i64())
        .map(|n| n as i32)
        .or_else(|| {
            v.get("total_episodes")
                .and_then(|x| x.as_i64())
                .map(|n| n as i32)
        })
        .or_else(|| {
            v.get("episodes")
                .and_then(|x| x.as_array())
                .map(|arr| arr.len() as i32)
        });

    let date_str = v
        .get("date")
        .or_else(|| v.get("air_date"))
        .and_then(|x| x.as_str());
    let year = date_str
        .and_then(|s| s.get(0..4))
        .and_then(|y| y.parse::<i32>().ok());

    Ok(BangumiSubjectDetail {
        id: id_v,
        name,
        name_cn,
        cover_url,
        episodes,
        year,
    })
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
            pick_directory_and_get_info,
            analyze_filename,
            search_bangumi_subjects,
            get_bangumi_subject_detail,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
