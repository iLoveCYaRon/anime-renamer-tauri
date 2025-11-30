export interface FileInfo {
  name: string;
  path: string;
  is_video: boolean;
}

export interface AnimeInfo {
  title: string;
  episode?: string;
  codec?: string;
  group?: string;
  year?: number;
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

export interface BatchLLMRequest {
  filenames: string[];
  model_url: string;
  model_name: string;
}

export interface BatchLLMResponse {
  success: boolean;
  data?: AnimeInfo;
  error?: string;
}
