#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_video: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct RenameRequest {
    pub video_files: Vec<FileInfo>,
    pub subtitle_files: Vec<FileInfo>,
    pub suffix: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RenameResponse {
    pub success: bool,
    pub message: String,
    pub renamed_files: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct LLMRequest {
    pub filename: String,
    pub model_url: String,
    pub model_name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AnimeInfo {
    pub title: String,
    pub season: u32,
    pub episode: u32,
    pub special_type: Option<String>,
    pub resolution: String,
    pub codec: String,
    pub group: String,
    pub language_tags: Vec<String>,
    pub confidence: f32,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct LLMResponse {
    pub success: bool,
    pub data: Option<AnimeInfo>,
    pub error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BangumiSubject {
    pub id: i64,
    pub name: String,
    pub name_cn: Option<String>,
    #[serde(rename = "type")]
    pub subject_type: Option<i32>,
    pub date: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct BangumiSubjectDetail {
    pub id: i64,
    pub name: String,
    pub name_cn: Option<String>,
    pub cover_url: Option<String>,
    pub episodes: Option<i32>,
    pub year: Option<i32>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Settings {
    pub episode_regex: String,
    pub model_url: String,
    pub model_name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DirectoryPickResult {
    pub files: Vec<FileInfo>,
    pub canceled: bool,
}

