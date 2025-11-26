import { invoke } from '@tauri-apps/api/core';
import { FileInfo, LLMRequest, LLMResponse } from '../types/llm';

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