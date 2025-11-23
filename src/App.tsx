// 应用入口组件：负责文件拖放/选择、列表展示与字幕重命名
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import {
  Button,
  Card,
  Col,
  Divider,
  Flex,
  Input,
  Layout,
  message,
  Row,
  Segmented,
  Space,
  Tag,
  Typography,
  Upload,
  UploadFile,
  Empty,
  List,
  Tooltip,
  ConfigProvider,
} from "antd";
import {
  ClearOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { AntdThemeProvider } from "./components/AntdThemeProvider";
import "./App.css";

// Ant Design 结构与排版
const { Header, Content } = Layout;
const { Title, Text } = Typography;

// 前端与后端共享的文件信息结构
interface FileInfo {
  name: string;
  path: string;
  is_video: boolean;
}

// 后端重命名响应结构
interface RenameResponse {
  success: boolean;
  message: string;
  renamed_files: string[];
}

// Tauri 拖放事件载荷
interface DragDropPayload {
  paths: string[];
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
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // 注册 Tauri 拖放事件，仅在首次挂载时绑定
  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    let isUnmounted = false;

    const setupListeners = async () => {
      try {
        unlistenDrop = await listen<DragDropPayload>(
          TauriEvent.DRAG_DROP,
          async (event) => {
            if (isUnmounted) return;
            setDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              await processDroppedPaths(paths);
            }
          }
        );
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

  // 统一提示方法
  const showMessage = (text: string, type: "success" | "error" | "info") => {
    messageApi.open({ type, content: text, duration: type === "info" ? 3 : 0 });
  };

  // 从后端解析拖入路径，过滤并返回 FileInfo
  const processDroppedPaths = async (paths: string[]) => {
    try {
      const fileInfos = await invoke<FileInfo[]>("get_dropped_files", { paths });
      updateFileLists(fileInfos);
    } catch (error) {
      console.error("处理拖放文件时出错:", error);
      showMessage("处理文件时出错，请重试", "error");
    }
  };

  // 合并去重并排序，分别更新视频/字幕列表
  const updateFileLists = (newFiles: FileInfo[]) => {
    const newVideos = newFiles.filter((file) => file.is_video);
    const newSubtitles = newFiles.filter((file) => !file.is_video);

    if (newVideos.length === 0 && newSubtitles.length === 0) return;

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

    showMessage(
      `成功添加 ${newVideos.length} 个视频文件和 ${newSubtitles.length} 个字幕文件`,
      "success"
    );
  };

  // 调用后端执行字幕重命名，使用选中的/自定义后缀
  const handleRename = async () => {
    if (videoFiles.length === 0 || subtitleFiles.length === 0) {
      showMessage("请先添加视频文件和字幕文件", "error");
      return;
    }

    if (videoFiles.length !== subtitleFiles.length) {
      showMessage(
        `视频文件数量(${videoFiles.length})与字幕文件数量(${subtitleFiles.length})不匹配`,
        "error"
      );
      return;
    }

    setLoading(true);
    try {
      const suffix = selectedSuffix || customSuffix;
      const response = await invoke<RenameResponse>("rename_subtitle_files", {
        request: {
          video_files: videoFiles,
          subtitle_files: subtitleFiles,
          suffix,
        },
      });

      if (response.success) {
        showMessage(response.message, "success");
        const updatedSubtitles = subtitleFiles.map((subtitle, index) => ({
          ...subtitle,
          name: response.renamed_files[index],
        }));
        setSubtitleFiles(updatedSubtitles);
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

  // 使用 Tauri 文件选择器（多选），将选择结果并入列表
  const pickFiles = async () => {
    try {
      const infos = await invoke<FileInfo[]>("pick_files_and_get_info");
      if (infos.length) updateFileLists(infos);
    } catch (e) {
      console.error(e);
      showMessage("选择文件失败", "error");
    }
  };

  // 清空所有已选择的文件与输入状态
  const clearFileLists = () => {
    setVideoFiles([]);
    setSubtitleFiles([]);
    setCustomSuffix("");
    setSelectedSuffix("");
  };

  // HTML5 拖放辅助：指示复制效果与显示遮罩
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  // 离开主容器时取消拖拽态
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  };

  // 阻止默认打开行为，实际处理由 Tauri 事件完成
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  // 预设字幕后缀选项
  const suffixOptions = [
    { label: "CHS", value: "CHS" },
    { label: "CHT", value: "CHT" },
    { label: "ENG", value: "ENG" },
    { label: "CHS&CHT", value: "CHS&CHT" },
    { label: "ZH", value: "ZH" },
    { label: "JP", value: "JP" },
  ];

  return (
    <ConfigProvider
      theme={{
        token: {
          colorError: "#ff4d4f",
        },
      }}
    >
      {contextHolder}
      <AntdThemeProvider>
        <Layout
          style={{ minHeight: "100vh", overflow: "hidden", maxHeight: "100vh" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          { /* 顶部栏：标题与操作按钮（选择文件 / 清空 / 重命名） */ }
          <Header style={{ background: "#001529", padding: "0 24px" }}>
            <Flex align="center" justify="space-between" style={{ height: "100%" }}>
              <Title level={3} style={{ margin: 0, color: "#fff" }}>
                Skyey Liner Renamer
              </Title>
              <Space>
                <Button icon={<FolderOpenOutlined />} onClick={pickFiles}>
                  选择文件
                </Button>
                <Button
                  danger
                  ghost
                  className="clear-btn"
                  icon={<ClearOutlined />}
                  onClick={clearFileLists}
                  disabled={videoFiles.length === 0 && subtitleFiles.length === 0}
                >
                  清空
                </Button>
              </Space>
            </Flex>
          </Header>
          { /* 主内容：上方文件列表（占满剩余空间） + 下方设置区 */ }
          <Content style={{ margin: "16px", display: "flex", flexDirection: "column", gap: "16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div className="file-lists-container" style={{ flex: 1, minHeight: 0 }}>
              { /* 文件列表区域：左右两列卡片，内部滚动 */ }
              <Row className="file-row" gutter={[12, 0]} style={{ flex: 1, minHeight: 0 }} align="stretch">
                <Col className="file-col file-col--video" xs={24} md={12} style={{ height: "100%" }}>
                  <Card className="section-card" size="small"
                    title={
                      <Space>
                        <PlayCircleOutlined />
                        视频文件
                        {videoFiles.length > 0 && (
                          <Tag color="blue">{videoFiles.length}</Tag>
                        )}
                      </Space>
                    }
                    style={{ height: "100%" }}
                  >
                    <div className={`list-body ${videoFiles.length === 0 ? "empty" : ""}`} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                      {videoFiles.length === 0 ? (
                        <Empty description="暂无视频文件" />
                      ) : (
                        <List
                          className="list-scroll"
                          style={{ flex: 1, overflowY: "auto", width: "100%" }}
                          size="small"
                          bordered
                          dataSource={videoFiles}
                          renderItem={(item) => (
                            <List.Item>
                              <Text ellipsis>{item.name}</Text>
                            </List.Item>
                          )}
                        />
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
                        {subtitleFiles.length > 0 && (
                          <Tag color="green">{subtitleFiles.length}</Tag>
                        )}
                      </Space>
                    }
                    style={{ height: "100%" }}
                  >
                    <div className={`list-body ${subtitleFiles.length === 0 ? "empty" : ""}`} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                      {subtitleFiles.length === 0 ? (
                        <Empty description="暂无字幕文件" />
                      ) : (
                        <List
                          className="list-scroll"
                          style={{ flex: 1, overflowY: "auto", width: "100%" }}
                          size="small"
                          bordered
                          dataSource={subtitleFiles}
                          renderItem={(item) => (
                            <List.Item>
                              <Text ellipsis>{item.name}</Text>
                            </List.Item>
                          )}
                        />
                      )}
                    </div>
                  </Card>
                </Col>
              </Row>
            </div>

            { /* 分隔线 */ }
            <Divider style={{ margin: "8px 0" }} />

            { /* 字幕后缀设置与执行 */ }
            <Card title="字幕语言后缀设置" size="small">
              <Row gutter={[24, 24]} align="bottom">
                <Col xs={24} md={6}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Text>自定义后缀</Text>
                    <Input
                      placeholder="例如: CHS, CHT, ENG"
                      value={customSuffix}
                      onChange={(e) => {
                        setCustomSuffix(e.target.value);
                        setSelectedSuffix("");
                      }}
                    />
                  </Space>
                </Col>
                <Col xs={24} md={8}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Text>快速选择</Text>
                    <Segmented
                      options={suffixOptions}
                      value={selectedSuffix || undefined}
                      onChange={(val) => {
                        setSelectedSuffix(val as string);
                        setCustomSuffix("");
                      }}
                      block
                    />
                  </Space>
                </Col>
                <Col xs={24} md={10}>
                  <Tooltip title="Ctrl+R">
                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={loading}
                      onClick={handleRename}
                      block
                    >
                      执行重命名
                    </Button>
                  </Tooltip>
                </Col>
              </Row>
            </Card>
          </Content>

          {dragging && (
            <div className="drop-overlay">
              <div className="drop-overlay-content">
                <UploadOutlined style={{ fontSize: 64 }} />
                <Title level={2} style={{ marginTop: 16 }}>
                  释放文件以添加
                </Title>
              </div>
            </div>
          )}
        </Layout>
      </AntdThemeProvider>
    </ConfigProvider>
  );
};

export default App;