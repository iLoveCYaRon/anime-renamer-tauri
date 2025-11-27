export interface FileInfo {
  name: string;
  path: string;
  is_video: boolean;
}

export interface AnimeInfo {
  title: string;
  season: number;
  episode: number;
  codec: string | undefined;
  group: string | undefined;
  language_tags: string | undefined;
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