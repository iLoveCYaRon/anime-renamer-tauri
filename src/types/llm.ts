export interface FileInfo {
  name: string;
  path: string;
  is_video: boolean;
}

export interface AnimeInfo {
  title: string;
  season: number;
  episode: number;
  special_type: string | null; // "SP", "OVA", "Movie"
  resolution: string;
  codec: string;
  group: string;
  language_tags: string[];
  confidence: number; // 0.0 to 1.0
}

export interface RecognitionResult {
  file: FileInfo;
  info: AnimeInfo | null;
  loading: boolean;
  error: string | null;
}

export interface LLMRequest {
  filename: string;
  model_url: string;
  model_name: string;
}

export interface LLMResponse {
  success: boolean;
  data?: AnimeInfo;
  error?: string;
}