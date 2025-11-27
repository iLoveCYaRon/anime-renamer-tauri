import React, { useEffect, useRef, useState } from "react";
import "./rename.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { Button, Card, Col, Divider, Empty, Input, List, Row, Space, Tag, Tooltip, Typography, message, } from "antd";
import {
  ClearOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { FileInfo } from "../types/llm";
import { pickFilesAndGetInfo, pickDirectoryAndGetInfo, loadSettings } from "../api/tauri";

interface DragDropPayload {
  paths: string[];
}

interface RenameResponse {
  success: boolean;
  message: string;
  renamed_files: string[];
}

export default function Rename() {
  const { Text, Title } = Typography;

  const [videoFiles, setVideoFiles] = useState<FileInfo[]>([]);
  const [subtitleFiles, setSubtitleFiles] = useState<FileInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [customSuffix, setCustomSuffix] = useState("");
  const [selectedSuffix, setSelectedSuffix] = useState("");
  const [loading, setLoading] = useState(false);

  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);

  const defaultEpisodeRegex = "\\[(\\d{2})\\]";
  const [episodeRegexStr, setEpisodeRegexStr] = useState<string>(defaultEpisodeRegex);
  const [episodeRegex, setEpisodeRegex] = useState<RegExp>(() => new RegExp(defaultEpisodeRegex));

  const [episodeItems, setEpisodeItems] = useState<
    { episode: string; video?: FileInfo; subtitle?: FileInfo }[]
  >([]);

  const suffixOptions = [
    { label: "chs", value: "chs" },
    { label: "cht", value: "cht" },
  ];

  useEffect(() => {
    const init = async () => {
      try {
        const s = await loadSettings();
        setEpisodeRegexStr(s.episode_regex || defaultEpisodeRegex);
      } catch {}
    };
    init();
  }, []);

  useEffect(() => {
    const vMap = new Map<string, FileInfo>();
    const sMap = new Map<string, FileInfo>();
    for (const v of videoFiles) {
      const ep = extractEpisode(v.name);
      if (ep) vMap.set(ep, v);
    }
    for (const s of subtitleFiles) {
      const ep = extractEpisode(s.name);
      if (ep) sMap.set(ep, s);
    }
    const episodes = Array.from(new Set([...vMap.keys(), ...sMap.keys()])).sort(
      (a, b) => Number(a) - Number(b)
    );
    const items = episodes.map((ep) => ({
      episode: ep,
      video: vMap.get(ep),
      subtitle: sMap.get(ep),
    }));
    setEpisodeItems(items);
  }, [videoFiles, subtitleFiles, episodeRegex]);

  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    let isUnmounted = false;
    const setupListeners = async () => {
      try {
        unlistenDrop = await listen<DragDropPayload>(TauriEvent.DRAG_DROP, async (event) => {
          if (isUnmounted) return;
          setDragging(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            await processDroppedPaths(paths);
          }
        });
      } catch (error) {
        console.error("Error setting up Tauri listeners:", error);
      }
    };
    setupListeners();
    return () => {
      isUnmounted = true;
      if (unlistenDrop) unlistenDrop();
    };
  }, []);

  const showMessage = (text: string, type: "success" | "error" | "info") => {
    const duration = type === "success" ? 3 : type === "info" ? 3 : 0;
    message.open({ type, content: text, duration });
  };

  const extractEpisode = (name: string): string | null => {
    const match = name.match(episodeRegex);
    return match ? match[1] : null;
  };

  const updateFileLists = (newFiles: FileInfo[]) => {
    const newVideos = newFiles.filter((file) => file.is_video);
    const newSubtitles = newFiles.filter((file) => !file.is_video);
    if (newVideos.length === 0 && newSubtitles.length === 0) return;

    setVideoFiles((prevVideos) => {
      const allVideos = [...prevVideos, ...newVideos];
      const uniqueVideos = Array.from(new Map(allVideos.map((v) => [v.path, v])).values());
      return uniqueVideos.sort((a, b) => a.name.localeCompare(b.name));
    });

    setSubtitleFiles((prevSubtitles) => {
      const allSubtitles = [...prevSubtitles, ...newSubtitles];
      const uniqueSubtitles = Array.from(new Map(allSubtitles.map((s) => [s.path, s])).values());
      return uniqueSubtitles.sort((a, b) => a.name.localeCompare(b.name));
    });

    showMessage(`成功添加 ${newVideos.length} 个视频文件和 ${newSubtitles.length} 个字幕文件`, "success");
  };

  const processDroppedPaths = async (paths: string[]) => {
    try {
      const fileInfos = await invoke<FileInfo[]>("get_dropped_files", { paths });
      updateFileLists(fileInfos);
    } catch (error) {
      console.error("处理拖放文件时出错:", error);
      showMessage("处理文件时出错，请重试", "error");
    }
  };

  const handleRename = async () => {
    const vMap = new Map<string, FileInfo>();
    const sMap = new Map<string, FileInfo>();
    for (const v of videoFiles) {
      const ep = extractEpisode(v.name);
      if (ep) vMap.set(ep, v);
    }
    for (const s of subtitleFiles) {
      const ep = extractEpisode(s.name);
      if (ep) sMap.set(ep, s);
    }
    const episodes = Array.from(new Set([...vMap.keys(), ...sMap.keys()])).sort((a, b) => Number(a) - Number(b));
    const pairs: { video: FileInfo; subtitle: FileInfo }[] = [];
    const missing: string[] = [];
    for (const ep of episodes) {
      const v = vMap.get(ep);
      const s = sMap.get(ep);
      if (v && s) pairs.push({ video: v, subtitle: s });
      else if (v && !s) missing.push(ep);
    }
    if (missing.length) showMessage(`已跳过缺失字幕的剧集: ${missing.join(", ")}`, "info");
    if (pairs.length === 0) {
      showMessage("请先添加视频文件和对应的字幕文件", "error");
      return;
    }

    setLoading(true);
    try {
      const suffix = selectedSuffix || customSuffix;
      const response = await invoke<RenameResponse>("rename_subtitle_files", {
        request: {
          video_files: pairs.map((p) => p.video),
          subtitle_files: pairs.map((p) => p.subtitle),
          suffix,
        },
      });

      if (response.success) {
        if (response.renamed_files.length !== pairs.length) {
          showMessage("返回的重命名数量与匹配的文件数量不一致", "error");
        } else {
          const renameMap = new Map<string, string>();
          pairs.forEach((p, idx) => {
            renameMap.set(p.subtitle.path, response.renamed_files[idx]);
          });
          const updatedSubtitles = subtitleFiles.map((subtitle) => {
            const newName = renameMap.get(subtitle.path);
            if (!newName) return subtitle;
            const sepIndex = Math.max(subtitle.path.lastIndexOf("/"), subtitle.path.lastIndexOf("\\"));
            const parent = sepIndex >= 0 ? subtitle.path.slice(0, sepIndex + 1) : "";
            const newPath = parent ? parent + newName : newName;
            return { ...subtitle, name: newName, path: newPath };
          });
          setSubtitleFiles(updatedSubtitles);
          showMessage(response.message, "success");
        }
      } else {
        showMessage(response.message, "error");
      }
    } catch (error) {
      console.error("重命名时出错:", error);
      showMessage("重命名时出错，请重试", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePickFiles = async () => {
    try {
      const infos = await pickFilesAndGetInfo();
      if (infos.length) updateFileLists(infos);
    } catch (e) {
      console.error(e);
      showMessage("选择文件失败", "error");
    }
  };

  const handlePickFolder = async () => {
    try {
      const result = await pickDirectoryAndGetInfo();
      if (result.canceled) return;
      setVideoFiles([]);
      setSubtitleFiles([]);
      if (result.files && result.files.length) {
        const files = result.files;
        const videoEpisodes = new Set<string>();
        for (const f of files) {
          if (f.is_video) {
            const ep = extractEpisode(f.name);
            if (ep) videoEpisodes.add(ep);
          }
        }
        const filtered = files.filter((f) => {
          if (f.is_video) return true;
          const ep = extractEpisode(f.name);
          return !!ep && videoEpisodes.has(ep);
        });
        updateFileLists(filtered);
      } else showMessage("所选文件夹中未找到视频或字幕文件", "info");
    } catch (e) {
      console.error(e);
      showMessage("选择文件夹失败", "error");
    }
  };

  const clearFileLists = () => {
    setVideoFiles([]);
    setSubtitleFiles([]);
    setCustomSuffix("");
    setSelectedSuffix("");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const videoStem = (name: string) => {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  };
  const ext = (name: string) => {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  };

  const previewName = (video: FileInfo, subtitle: FileInfo) => {
    const sfx = (selectedSuffix || customSuffix).trim();
    const stem = videoStem(video.name);
    const e = ext(subtitle.name);
    return sfx ? `${stem}.${sfx}.${e}` : `${stem}.${e}`;
  };

  return (
    <div
      className="rename-page"
      style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>字幕重命名</Title>
        </Space>
        <Space>
          <Button icon={<FolderOpenOutlined />} onClick={handlePickFiles}>选择文件</Button>
          <Button icon={<FolderOutlined />} onClick={handlePickFolder}>选择文件夹</Button>
          <Button
            danger
            ghost
            icon={<ClearOutlined />}
            onClick={clearFileLists}
            disabled={videoFiles.length === 0 && subtitleFiles.length === 0}
          >
            清空
          </Button>
        </Space>
      </div>

      

      <div className="file-lists-container" style={{ flex: 1, minHeight: 0 }}>
        <Row className="file-row" gutter={[12, 0]} style={{ flex: 1, minHeight: 0 }} align="stretch">
          <Col className="file-col file-col--video" xs={24} md={12} style={{ height: "100%" }}>
            <Card className="section-card" size="small"
              title={
                <Space>
                  <PlayCircleOutlined />
                  视频文件
                  {episodeItems.length > 0 && (
                    <Tag color="blue">{episodeItems.length}</Tag>
                  )}
                </Space>
              }
              style={{ height: "100%" }}
            >
              <div className={`list-body ${episodeItems.length === 0 ? "empty" : ""}`} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                {episodeItems.length === 0 ? (
                  <Empty description="暂无视频文件" />
                ) : (
                  <div
                    className="list-scroll"
                    style={{ flex: 1, overflowY: "auto", width: "100%" }}
                    ref={leftScrollRef}
                    onScroll={() => {
                      const left = leftScrollRef.current;
                      const right = rightScrollRef.current;
                      if (!left || !right) return;
                      const fromMax = left.scrollHeight - left.clientHeight;
                      const toMax = right.scrollHeight - right.clientHeight;
                      const ratio = fromMax > 0 ? left.scrollTop / fromMax : 0;
                      right.scrollTop = ratio * toMax;
                    }}
                  >
                    <List<{ episode: string; video?: FileInfo; subtitle?: FileInfo }>
                      size="small"
                      bordered
                      dataSource={episodeItems}
                      renderItem={(item) => (
                        <List.Item>
                          <Space>
                            <Tag>{item.episode}</Tag>
                            <Text ellipsis>{item.video ? item.video.name : "-"}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </div>
                )}
              </div>
            </Card>
          </Col>

          <Col className="file-col file-col--subtitle" xs={24} md={12} style={{ height: "100%" }}>
            <Card className="section-card" size="small"
              title={
                <Space>
                  <FileTextOutlined />
                  字幕文件
                  {episodeItems.length > 0 && (
                    <Tag color="green">{episodeItems.filter((it) => it.subtitle).length}/{episodeItems.length}</Tag>
                  )}
                </Space>
              }
              style={{ height: "100%" }}
            >
              <div className={`list-body ${episodeItems.length === 0 ? "empty" : ""}`} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                {episodeItems.length === 0 ? (
                  <Empty description="暂无字幕文件" />
                ) : (
                  <div
                    className="list-scroll"
                    style={{ flex: 1, overflowY: "auto", width: "100%" }}
                    ref={rightScrollRef}
                    onScroll={() => {
                      const left = leftScrollRef.current;
                      const right = rightScrollRef.current;
                      if (!left || !right) return;
                      const fromMax = right.scrollHeight - right.clientHeight;
                      const toMax = left.scrollHeight - left.clientHeight;
                      const ratio = fromMax > 0 ? right.scrollTop / fromMax : 0;
                      left.scrollTop = ratio * toMax;
                    }}
                  >
                    <List<{ episode: string; video?: FileInfo; subtitle?: FileInfo }>
                      size="small"
                      bordered
                      dataSource={episodeItems}
                      renderItem={(item) => (
                        <List.Item>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                            <Space>
                              <Tag>{item.episode}</Tag>
                              {item.subtitle ? (
                                <Text ellipsis>{item.subtitle.name}</Text>
                              ) : (
                                <Tag color="red">缺失</Tag>
                              )}
                            </Space>
                            {item.video && item.subtitle && (
                              <div className="rename-connect-row">
                                <span className="rename-connector">└</span>
                                <span
                                  className="rename-preview"
                                  title={previewName(item.video, item.subtitle)}
                                >
                                  {previewName(item.video, item.subtitle)}
                                </span>
                              </div>
                            )}
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                )}
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      <Divider style={{ margin: "8px 0" }} />

      <Card title="字幕语言后缀设置" size="small">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} flex="auto">
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Text>自定义后缀</Text>
              <Input
                size="middle"
                placeholder="例如: chs 或 cht"
                value={customSuffix}
                onChange={(e) => {
                  setCustomSuffix(e.target.value);
                  setSelectedSuffix("");
                }}
              />
            </Space>
          </Col>
          <Col xs={24} flex="none">
            <Space orientation="vertical">
              <Text>快速选择</Text>
              <Space wrap>
                <Button
                  key="none"
                  size="middle"
                  type={customSuffix.trim() === "" ? "primary" : "default"}
                  onClick={() => {
                    setCustomSuffix("");
                    setSelectedSuffix("");
                  }}
                >
                  无
                </Button>
                {suffixOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    size="middle"
                    type={customSuffix.toLowerCase() === opt.value ? "primary" : "default"}
                    onClick={() => {
                      setCustomSuffix(opt.value);
                      setSelectedSuffix("");
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
                <Tooltip title="Ctrl+R">
                  <Button
                    size="middle"
                    type="primary"
                    icon={<ReloadOutlined />}
                    loading={loading}
                    onClick={handleRename}
                    className="rename-btn-wide"
                  >
                    执行重命名
                  </Button>
                </Tooltip>
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      {dragging && (
        <div className="rename-drop-overlay">
          <div className="rename-drop-overlay-content">
            <UploadOutlined style={{ fontSize: 64 }} />
            <Title level={2} style={{ marginTop: 16 }}>
              释放文件以添加
            </Title>
          </div>
        </div>
      )}

    </div>
  );
}
