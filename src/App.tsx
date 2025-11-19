import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

interface FileInfo {
  name: string;
  path: string;
  is_video: boolean;
}

interface RenameResponse {
  success: boolean;
  message: string;
  renamed_files: string[];
}

// 视频文件扩展名列表
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', 
  '.flv', '.webm', '.m4v', '.rmvb', '.3gp'
];

// 字幕文件扩展名列表
const SUBTITLE_EXTENSIONS = [
  '.srt', '.ass', '.ssa', '.sub', '.idx', 
  '.vtt', '.txt', '.smi', '.sbv', '.dfxp'
];

const App = () => {
  const [videoFiles, setVideoFiles] = useState<FileInfo[]>([]);
  const [subtitleFiles, setSubtitleFiles] = useState<FileInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [customSuffix, setCustomSuffix] = useState('');
  const [selectedSuffix, setSelectedSuffix] = useState('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');

  // 判断文件是否为视频文件
  const isVideoFile = (fileName: string): boolean => {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return VIDEO_EXTENSIONS.includes(ext);
  };

  // 判断文件是否为字幕文件
  const isSubtitleFile = (fileName: string): boolean => {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.sub', '.idx', '.vtt', '.txt'];
    return SUBTITLE_EXTENSIONS.includes(ext);
  };

  // 处理文件添加（拖放和文件选择器共用）
  const processFiles = async (files: FileList | File[]) => {
    try {
      const fileArray = Array.from(files);
      
      // 在浏览器环境中，File对象的path属性不可用
      // 我们需要使用文件名来创建模拟的文件信息
      const fileInfos: FileInfo[] = [];
      
      for (const file of fileArray) {
        const fileName = file.name;
        const isVideo = isVideoFile(fileName);
        const isSubtitle = isSubtitleFile(fileName);
        
        // 只处理视频和字幕文件
        if (isVideo || isSubtitle) {
          fileInfos.push({
            name: fileName,
            path: fileName, // 使用文件名作为路径，因为真实路径不可用
            is_video: isVideo
          });
        }
      }
      
      // 分类文件
      const newVideos = fileInfos.filter(file => file.is_video);
      const newSubtitles = fileInfos.filter(file => !file.is_video && isSubtitleFile(file.name));

      // 合并现有文件并去重
      const allVideos = [...videoFiles, ...newVideos];
      const uniqueVideos = Array.from(
        new Map(allVideos.map(v => [v.path, v])).values()
      );

      const allSubtitles = [...subtitleFiles, ...newSubtitles];
      const uniqueSubtitles = Array.from(
        new Map(allSubtitles.map(s => [s.path, s])).values()
      );

      // 更新状态，按字母顺序排序
      setVideoFiles(uniqueVideos.sort((a, b) => a.name.localeCompare(b.name)));
      setSubtitleFiles(uniqueSubtitles.sort((a, b) => a.name.localeCompare(b.name)));
      
      // 显示成功消息
      setStatusMessage(`成功添加 ${newVideos.length} 个视频文件和 ${newSubtitles.length} 个字幕文件`);
      setStatusType('success');
      
      // 3秒后清除消息
      setTimeout(() => {
        setStatusMessage('');
      }, 3000);
      
    } catch (error) {
      console.error('处理文件时出错:', error);
      setStatusMessage('处理文件时出错，请重试');
      setStatusType('error');
    }
  };

  // 处理拖放
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    await processFiles(e.dataTransfer.files);
  };

  // 处理文件选择器
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
      // 清空文件输入，允许重复选择相同文件
      e.target.value = '';
    }
  };

  // 清空文件列表
  const clearFileLists = () => {
    setVideoFiles([]);
    setSubtitleFiles([]);
    setStatusMessage('');
    setSelectedSuffix('');
    setCustomSuffix('');
  };
  
  // 处理重命名
  const handleRename = async () => {
    // 检查视频文件和字幕文件数量是否匹配
    if (videoFiles.length === 0 || subtitleFiles.length === 0) {
      setStatusMessage('请先添加视频文件和字幕文件');
      setStatusType('error');
      return;
    }
    
    if (videoFiles.length !== subtitleFiles.length) {
      setStatusMessage(`视频文件数量(${videoFiles.length})与字幕文件数量(${subtitleFiles.length})不匹配`);
      setStatusType('error');
      return;
    }
    
    try {
      // 使用选中的后缀或自定义后缀
      const suffix = selectedSuffix || customSuffix;
      
      // 调用Tauri后端命令执行重命名
      const response = await invoke<RenameResponse>('rename_subtitle_files', {
        request: {
          video_files: videoFiles,
          subtitle_files: subtitleFiles,
          suffix: suffix
        }
      });
      
      if (response.success) {
        setStatusMessage(response.message);
        setStatusType('success');
        
        // 更新字幕文件列表
        const updatedSubtitles = subtitleFiles.map((subtitle, index) => ({
          ...subtitle,
          name: response.renamed_files[index]
        }));
        setSubtitleFiles(updatedSubtitles);
      } else {
        setStatusMessage(response.message);
        setStatusType('error');
      }
    } catch (error) {
      console.error('重命名时出错:', error);
      setStatusMessage('重命名时出错，请重试');
      setStatusType('error');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Skyey Liner Renamer</h1>
      </header>
      
      <main className="main">
        <section className={`drop-area ${dragging ? 'dragging' : ''}`} 
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <p>请将文件拖放到此处</p>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '10px' }}>
            或使用上方的"选择文件"按钮添加文件
          </p>
        </section>
        
        {/* 添加文件选择器和清除按钮 */}
        <div className="control-buttons">
          <input
            type="file"
            id="file-input"
            multiple
            accept=".mp4,.mkv,.avi,.mov,.wmv,.flv,.webm,.m4v,.rmvb,.3gp,.srt,.ass,.ssa,.sub,.idx,.vtt,.txt,.smi,.sbv,.dfxp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="add-files-button">
            选择文件
          </label>
          <button className="clear-button" onClick={clearFileLists}>
            清空文件列表
          </button>
        </div>
        
        <section className="file-lists">
          <div className="list-container">
            <h2>视频文件</h2>
            <div className="file-list">
              {videoFiles.length === 0 ? (
                <p className="empty-message">暂无视频文件</p>
              ) : (
                videoFiles.map((file, index) => (
                  <div key={index} className="file-item">{file.name}</div>
                ))
              )}
            </div>
          </div>
          
          <div className="list-container">
            <h2>字幕文件</h2>
            <div className="file-list">
              {subtitleFiles.length === 0 ? (
                <p className="empty-message">暂无字幕文件</p>
              ) : (
                subtitleFiles.map((file, index) => (
                  <div key={index} className="file-item">{file.name}</div>
                ))
              )}
            </div>
          </div>
        </section>
        
        <section className="rename-controls">
          <div className="suffix-input-area">
            <label htmlFor="subtitle-suffix">请输入字幕语言后缀：</label>
            <input 
              id="subtitle-suffix"
              type="text" 
              value={customSuffix}
              onChange={(e) => {
                setCustomSuffix(e.target.value);
                setSelectedSuffix('');
              }}
              placeholder="例如: CHS, CHT, ENG"
              className="suffix-input"
            />
          </div>
          
          <div className="preset-buttons">
            <p>可选下方按钮：</p>
            <div className="preset-buttons-row">
              <button 
                className={`preset-button ${selectedSuffix === 'CHS' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('CHS');
                  setCustomSuffix('');
                }}
              >
                CHS
              </button>
              <button 
                className={`preset-button ${selectedSuffix === 'CHT' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('CHT');
                  setCustomSuffix('');
                }}
              >
                CHT
              </button>
              <button 
                className={`preset-button ${selectedSuffix === 'ENG' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('ENG');
                  setCustomSuffix('');
                }}
              >
                ENG
              </button>
              <button 
                className={`preset-button ${selectedSuffix === 'CHS&CHT' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('CHS&CHT');
                  setCustomSuffix('');
                }}
              >
                CHS&CHT
              </button>
              <button 
                className={`preset-button ${selectedSuffix === 'ZH' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('ZH');
                  setCustomSuffix('');
                }}
              >
                ZH
              </button>
              <button 
                className={`preset-button ${selectedSuffix === 'JP' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedSuffix('JP');
                  setCustomSuffix('');
                }}
              >
                JP
              </button>
            </div>
          </div>
          
          <button 
            className="rename-button"
            onClick={handleRename}
            title="Ctrl+R"
          >
            执行重命名(Ctrl+R)
          </button>
          {statusMessage && (
            <div className={`status-message status-${statusType}`}>
              {statusMessage}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
