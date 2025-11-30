use std::time::Duration;

use regex::Regex;
use serde_json;

use crate::{
    types::{
        AnimeInfo, BangumiSubject, BangumiSubjectDetail, BatchLLMRequest, BatchLLMResponse, LLMRequest, LLMResponse,
    },
    utils::is_subtitle_file,
};

// 分析单个文件名，调用 LLM
#[tauri::command]
pub async fn analyze_filename(request: LLMRequest) -> Result<LLMResponse, String> {
    let prompt = r#"
你是动漫视频信息抽取专家，请仅返回 JSON，不要额外说明。
提取要求
标题：提取完整中文/日文剧集名称，包含对应季/集，去除无关分辨率、压制组信息。
集数：两位数字表示，如 01、12，无法确定填 00。
编码格式：识别常见编码，如 AVC、HEVC、返回字符串。
压制组：提取文件名中的压制组名称，如 VCB-Studio、LoliHouse，返回字符串。
必须按照固定字段顺序返回：
{"title": "完整标题","episode": "两位集数","codec": "编码字符串","group": "压制组字符串"}
"#
    .to_string();
    let user_content = format!("这是视频文件名，请提取相关信息：{}", request.filename);
    let request_body = serde_json::json!({
        "model": request.model_name,
        "messages": [
            { "role": "system", "content": prompt },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.1,
        "max_tokens": 500000
    });

    // 构建HTTP客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 调用 LLM 模型
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

    // 获取 content 字段
    let content = response_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("无法从LLM响应中获取内容")?;

    println!("LLM响应内容: {}", content);

    // 清理思考链 - 去除 <seed:think>xxx</seed:think> 结构
    let re = Regex::new(r"(?s)<seed:think>.*?</seed:think>").unwrap();
    let cleaned_content = re.replace_all(content, "").to_string();
    match serde_json::from_str::<AnimeInfo>(&cleaned_content) {
        Ok(anime_info) => Ok(LLMResponse {
            success: true,
            data: Some(anime_info),
            error: None,
        }),
        Err(_) => {
            // 如果直接解析失败，尝试去除代码块后再解析
            let final_content = cleaned_content
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();

            match serde_json::from_str::<AnimeInfo>(final_content) {
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

// 批量分析文件名，调用 LLM
#[tauri::command]
pub async fn batch_analyze_filenames(request: BatchLLMRequest) -> Result<BatchLLMResponse, String> {
    if request.filenames.is_empty() {
        return Ok(BatchLLMResponse {
            success: false,
            data: None,
            error: Some("文件列表为空".to_string()),
        });
    }

    let prompt = r#"
你是动漫信息聚合专家，需根据一组文件名推断它们对应的同一部动画标题。

任务要求
1. 输入多条文件名
2. 找出这些文件名最可能对应的动画标题
3. 返回推测标题及置信度

提示
- 提取文件名中的共通关键词作为判断依据
- 忽略分辨率、编码格式和压制组等噪声信息
- 优先识别中文/日文标题，如无则可用英文
- 置信度为 0-1 之间的小数，根据匹配度与一致性给出

返回格式
{"title": "推测的标题"}

仅返回 JSON，不要任何其他文字。
"#;

    let filenames_text = request.filenames.join("\n");
    let user_content = format!(
        "以下是文件名，请推测对应的同一部动画标题：\n{}",
        filenames_text
    );

    let request_body = serde_json::json!({
        "model": request.model_name,
        "messages": [
            { "role": "system", "content": prompt },
            { "role": "user", "content": user_content }
        ],
        "temperature": 0.3,
        "max_tokens": 200000
    });

    // 构建HTTP客户端
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 调用 LLM 模型
    let response = client
        .post(&request.model_url)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("请求LLM模型失败: {}", e))?;

    if !response.status().is_success() {
        return Ok(BatchLLMResponse {
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

    // 获取 content 字段
    let content = response_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("无法从LLM响应中获取内容")?;

    println!("批量LLM响应内容: {}", content);

    // 清理思考链 - 去除 <seed:think>xxx</seed:think> 结构
    let re = Regex::new(r"(?s)<seed:think>.*?</seed:think>").unwrap();
    let cleaned_content = re.replace_all(content, "").to_string();
    match serde_json::from_str::<AnimeInfo>(&cleaned_content) {
        Ok(result) => Ok(BatchLLMResponse {
            success: true,
            data: Some(result),
            error: None,
        }),
        Err(_) => {
            // 如果直接解析失败，尝试去除代码块后再解析
            let final_content = cleaned_content
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();

            match serde_json::from_str::<AnimeInfo>(final_content) {
                Ok(result) => Ok(BatchLLMResponse {
                    success: true,
                    data: Some(result),
                    error: None,
                }),
                Err(_) => Ok(BatchLLMResponse {
                    success: false,
                    data: None,
                    error: Some(format!("解析LLM响应格式失败: {}", content)),
                }),
            }
        }
    }
}

#[tauri::command]
pub async fn search_bangumi_subjects(
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
pub async fn get_bangumi_subject_detail(id: i64) -> Result<BangumiSubjectDetail, String> {
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
