import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

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
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".rmvb",
    ".3gp",
];

// 字幕文件扩展名列表
const SUBTITLE_EXTENSIONS = [
    ".srt",
    ".ass",
    ".ssa",
    ".sub",
    ".idx",
    ".vtt",
    ".txt",
    ".smi",
    ".sbv",
    ".dfxp",
];

const App = () => {
    const [videoFiles, setVideoFiles] = useState<FileInfo[]>([]);
    const [subtitleFiles, setSubtitleFiles] = useState<FileInfo[]>([]);
    const [dragging, setDragging] = useState(false);
    const [customSuffix, setCustomSuffix] = useState("");
    const [selectedSuffix, setSelectedSuffix] = useState("");
    const [statusMessage, setStatusMessage] = useState<string>("");
    const [statusType, setStatusType] = useState<"success" | "error" | "info">(
        "info"
    );

    // 监听 Tauri 文件拖放事件
  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    let unlistenHover: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let isUnmounted = false;

    console.log('Setting up Tauri event listeners...');

    const setupListeners = async () => {
      try {
        unlistenHover = await listen('tauri://file-drop-hover', () => {
          if (isUnmounted) return;
          console.log('File drop hover');
          setDragging(true);
        });

        unlistenCancel = await listen('tauri://file-drop-cancelled', () => {
          if (isUnmounted) return;
          console.log('File drop cancelled');
          setDragging(false);
        });

        unlistenDrop = await listen('tauri://file-drop', async (event) => {
          if (isUnmounted) return;
          console.log('File drop event received:', event);
          setDragging(false);
          const paths = event.payload as string[];
          if (paths && paths.length > 0) {
            console.log('Processing paths:', paths);
            await processDroppedPaths(paths);
          } else {
            console.log('No paths received in drop event');
          }
        });
        
        console.log('Tauri event listeners set up successfully');
      } catch (error) {
        console.error('Error setting up Tauri listeners:', error);
      }
    };

    setupListeners();

    return () => {
      isUnmounted = true;
      console.log('Cleaning up Tauri event listeners...');
      if (unlistenDrop) unlistenDrop();
      if (unlistenHover) unlistenHover();
      if (unlistenCancel) unlistenCancel();
    };
  }, []); // 空依赖数组，确保只注册一次

    // 处理从 Tauri 拖放事件获取的路径
    const processDroppedPaths = async (paths: string[]) => {
        try {
            // 调用后端获取文件信息
            const fileInfos = await invoke<FileInfo[]>("get_dropped_files", {
                paths,
            });

            updateFileLists(fileInfos);
        } catch (error) {
            console.error("处理拖放文件时出错:", error);
            setStatusMessage("处理文件时出错，请重试");
            setStatusType("error");
        }
    };

    // 统一更新文件列表逻辑
    const updateFileLists = (newFiles: FileInfo[]) => {
        // 分类文件
        const newVideos = newFiles.filter((file) => file.is_video);
        const newSubtitles = newFiles.filter((file) => !file.is_video); // 后端已经过滤了非字幕文件

        if (newVideos.length === 0 && newSubtitles.length === 0) {
            return;
        }

        // 合并现有文件并去重
        // 注意：这里需要使用函数式更新，以确保获取到最新的 state
        setVideoFiles((prevVideos) => {
            const allVideos = [...prevVideos, ...newVideos];
            const uniqueVideos = Array.from(
                new Map(allVideos.map((v) => [v.path, v])).values()
            );
            return uniqueVideos.sort((a, b) => a.name.localeCompare(b.name));
        });

        setSubtitleFiles((prevSubtitles) => {
            const allSubtitles = [...prevSubtitles, ...newSubtitles];
            const uniqueSubtitles = Array.from(
                new Map(allSubtitles.map((s) => [s.path, s])).values()
            );
            return uniqueSubtitles.sort((a, b) => a.name.localeCompare(b.name));
        });

        // 显示成功消息
        setStatusMessage(
            `成功添加 ${newVideos.length} 个视频文件和 ${newSubtitles.length} 个字幕文件`
        );
        setStatusType("success");

        // 3秒后清除消息
        setTimeout(() => {
            setStatusMessage("");
        }, 3000);
    };

    // 处理文件选择器（仍然受限于浏览器安全策略，无法获取完整路径，仅用于演示或非重命名操作）
    // 注意：对于重命名功能，必须使用拖放或通过 Tauri 对话框选择文件（如果实现了的话）
    const processFiles = async (files: FileList | File[]) => {
        // 提示用户使用拖放以获得最佳体验
        setStatusMessage(
            "提示：请使用拖放方式添加文件以确保能获取完整路径进行重命名"
        );
        setStatusType("info");

        // 仍然尝试处理，但路径可能不正确
        try {
            const fileArray = Array.from(files);
            const fileInfos: FileInfo[] = [];

            // 辅助函数：判断是否为视频文件
            const isVideoFile = (fileName: string): boolean => {
                const ext = fileName
                    .toLowerCase()
                    .substring(fileName.lastIndexOf("."));
                return VIDEO_EXTENSIONS.includes(ext);
            };

            // 辅助函数：判断是否为字幕文件
            const isSubtitleFile = (fileName: string): boolean => {
                const ext = fileName
                    .toLowerCase()
                    .substring(fileName.lastIndexOf("."));
                return SUBTITLE_EXTENSIONS.includes(ext);
            };

            for (const file of fileArray) {
                const fileName = file.name;
                const isVideo = isVideoFile(fileName);
                const isSubtitle = isSubtitleFile(fileName);

                if (isVideo || isSubtitle) {
                    fileInfos.push({
                        name: fileName,
                        path: fileName, // 警告：这里路径是不完整的
                        is_video: isVideo,
                    });
                }
            }

            updateFileLists(fileInfos);
        } catch (error) {
            console.error("处理文件时出错:", error);
        }
    };

    // 处理文件选择器
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            await processFiles(e.target.files);
            // 清空文件输入，允许重复选择相同文件
            e.target.value = "";
        }
    };

    // 清空文件列表
    const clearFileLists = () => {
        setVideoFiles([]);
        setSubtitleFiles([]);
        setStatusMessage("");
        setSelectedSuffix("");
        setCustomSuffix("");
    };

    // 处理重命名
    const handleRename = async () => {
        // 检查视频文件和字幕文件数量是否匹配
        if (videoFiles.length === 0 || subtitleFiles.length === 0) {
            setStatusMessage("请先添加视频文件和字幕文件");
            setStatusType("error");
            return;
        }

        if (videoFiles.length !== subtitleFiles.length) {
            setStatusMessage(
                `视频文件数量(${videoFiles.length})与字幕文件数量(${subtitleFiles.length})不匹配`
            );
            setStatusType("error");
            return;
        }

        try {
            // 使用选中的后缀或自定义后缀
            const suffix = selectedSuffix || customSuffix;

            // 调用Tauri后端命令执行重命名
            const response = await invoke<RenameResponse>(
                "rename_subtitle_files",
                {
                    request: {
                        video_files: videoFiles,
                        subtitle_files: subtitleFiles,
                        suffix: suffix,
                    },
                }
            );

            if (response.success) {
                setStatusMessage(response.message);
                setStatusType("success");

                // 更新字幕文件列表
                const updatedSubtitles = subtitleFiles.map(
                    (subtitle, index) => ({
                        ...subtitle,
                        name: response.renamed_files[index],
                    })
                );
                setSubtitleFiles(updatedSubtitles);
            } else {
                setStatusMessage(response.message);
                setStatusType("error");
            }
        } catch (error) {
            console.error("重命名时出错:", error);
            setStatusMessage("重命名时出错，请重试");
            setStatusType("error");
        }
    };

    // HTML5 拖放处理 (作为 Tauri 事件的补充和 fallback)
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
        setDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        // 防止在子元素间移动时触发离开
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
            return;
        }
        setDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        // 注意：实际的文件处理由 Tauri 的 file-drop 事件处理
        // 这里主要是为了阻止浏览器默认行为（打开文件）
    };

    return (
        <div 
            className="app"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <header className="header">
                <h1>Skyey Liner Renamer</h1>
            </header>

            <main className="main">
        {/* 全屏拖放遮罩 */}
        {dragging && (
          <div className="drop-overlay">
            <div className="drop-overlay-content">
              <p>释放文件以添加</p>
            </div>
          </div>
        )}



                {/* 添加文件选择器和清除按钮 */}
                <div className="control-buttons">
                    <input
                        type="file"
                        id="file-input"
                        multiple
                        accept=".mp4,.mkv,.avi,.mov,.wmv,.flv,.webm,.m4v,.rmvb,.3gp,.srt,.ass,.ssa,.sub,.idx,.vtt,.txt,.smi,.sbv,.dfxp"
                        onChange={handleFileSelect}
                        style={{ display: "none" }}
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
                                    <div key={index} className="file-item">
                                        {file.name}
                                    </div>
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
                                    <div key={index} className="file-item">
                                        {file.name}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                <section className="rename-controls">
                    <div className="suffix-input-area">
                        <label htmlFor="subtitle-suffix">
                            请输入字幕语言后缀：
                        </label>
                        <input
                            id="subtitle-suffix"
                            type="text"
                            value={customSuffix}
                            onChange={(e) => {
                                setCustomSuffix(e.target.value);
                                setSelectedSuffix("");
                            }}
                            placeholder="例如: CHS, CHT, ENG"
                            className="suffix-input"
                        />
                    </div>

                    <div className="preset-buttons">
                        <p>可选下方按钮：</p>
                        <div className="preset-buttons-row">
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "CHS" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("CHS");
                                    setCustomSuffix("");
                                }}
                            >
                                CHS
                            </button>
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "CHT" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("CHT");
                                    setCustomSuffix("");
                                }}
                            >
                                CHT
                            </button>
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "ENG" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("ENG");
                                    setCustomSuffix("");
                                }}
                            >
                                ENG
                            </button>
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "CHS&CHT" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("CHS&CHT");
                                    setCustomSuffix("");
                                }}
                            >
                                CHS&CHT
                            </button>
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "ZH" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("ZH");
                                    setCustomSuffix("");
                                }}
                            >
                                ZH
                            </button>
                            <button
                                className={`preset-button ${
                                    selectedSuffix === "JP" ? "active" : ""
                                }`}
                                onClick={() => {
                                    setSelectedSuffix("JP");
                                    setCustomSuffix("");
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
