import { invoke } from '@tauri-apps/api/core';
import { FileInfo, LLMRequest, LLMResponse, BatchLLMRequest, BatchLLMResponse } from '../types/llm';

// 确保Tauri API可用
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export interface DirectoryPickResult {
  files: FileInfo[];
  canceled: boolean;
}

// 获取拖放的文件
export async function getDroppedFiles(paths: string[]): Promise<FileInfo[]> {
  if (!isTauri) {
    throw new Error('Tauri API 不可用');
  }
  return invoke('get_dropped_files', { paths });
}

// 选择文件
export async function pickFilesAndGetInfo(): Promise<FileInfo[]> {
  if (!isTauri) {
    throw new Error('Tauri API 不可用');
  }
  return invoke('pick_files_and_get_info');
}

// 选择文件夹
export async function pickDirectoryAndGetInfo(): Promise<DirectoryPickResult> {
  if (!isTauri) {
    throw new Error('Tauri API 不可用');
  }
  return invoke('pick_directory_and_get_info');
}

// 分析文件名
export async function analyzeFilename(request: LLMRequest): Promise<LLMResponse> {
  if (!isTauri) {
    throw new Error('Tauri API 不可用');
  }
  return invoke('analyze_filename', { request });
}

// 批量分析文件名
export async function batchAnalyzeFilenames(request: BatchLLMRequest): Promise<BatchLLMResponse> {
  if (!isTauri) {
    throw new Error('Tauri API 不可用');
  }
  return invoke('batch_analyze_filenames', { request });
}

export interface Settings {
  episode_regex: string;
  model_url: string;
  model_name: string;
}

export async function loadSettings(): Promise<Settings> {
  if (!isTauri) {
    return {
      episode_regex: '\\[(\\d{2})\\]',
      model_url: 'http://localhost:11434/v1/chat/completions',
      model_name: 'qwen/qwen3-vl-8b',
    };
  }
  return invoke('load_settings');
}

export async function saveSettings(settings: Settings): Promise<boolean> {
  if (!isTauri) {
    return true;
  }
  return invoke('save_settings', { settings });
}

export interface BangumiSubject {
  id: number;
  name: string;
  name_cn?: string;
  subject_type?: number;
  date?: string;
}

export async function searchBangumiSubjects(query: string, limit = 10): Promise<BangumiSubject[]> {
  if (!isTauri) {
    return [];
  }
  return invoke('search_bangumi_subjects', { query, limit });
}

export interface BangumiSubjectDetail {
  id: number;
  name: string;
  name_cn?: string;
  cover_url?: string;
  episodes?: number;
  year?: number;
}

export async function getBangumiSubjectDetail(id: number): Promise<BangumiSubjectDetail> {
  if (!isTauri) {
    return { id, name: String(id) } as BangumiSubjectDetail;
  }
  return invoke('get_bangumi_subject_detail', { id });
}
