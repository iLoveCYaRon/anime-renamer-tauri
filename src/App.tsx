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
  theme,
} from "antd";
import {
  ClearOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import "./App.css";
import Welcome from "./pages/Welcome";

// Ant Design 结构与排版
const { Header, Content, Sider } = Layout;
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

const App = () => {
  const [videoFiles, setVideoFiles] = useState<FileInfo[]>([]);
  const [subtitleFiles, setSubtitleFiles] = useState<FileInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [customSuffix, setCustomSuffix] = useState("");
  const [selectedSuffix, setSelectedSuffix] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // 页面导航状态：welcome | rename
  const [activePage, setActivePage] = useState<"welcome" | "rename">("welcome");
  // 侧边栏折叠状态
  const [collapsed, setCollapsed] = useState<boolean>(true);
  // 页面切换过渡控制
  const [pageAnimKey, setPageAnimKey] = useState<number>(0);
  // 基于剧集对齐展示与缺失状态
  const [episodeItems, setEpisodeItems] = useState<
    { episode: string; video?: FileInfo; subtitle?: FileInfo }[]
  >([]);
  const [missingEpisodes, setMissingEpisodes] = useState<string[]>([]);
  // 正则配置：默认用于提取剧集编号（捕获组1）
  const defaultEpisodeRegex = "\\[(\\d{2})\\]";
  const [episodeRegexStr, setEpisodeRegexStr] = useState<string>(defaultEpisodeRegex);
  const [episodeRegexError, setEpisodeRegexError] = useState<boolean>(false);
  const [episodeRegex, setEpisodeRegex] = useState<RegExp>(() => new RegExp(defaultEpisodeRegex));
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );
  const leftScrollRef = React.useRef<HTMLDivElement | null>(null);
  const rightScrollRef = React.useRef<HTMLDivElement | null>(null);
  const syncingRef = React.useRef(false);

  // 页面切换时触发轻量入场动画
  useEffect(() => {
    setPageAnimKey((k) => k + 1);
  }, [activePage]);

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

    const mql =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    if (mql) {
      if (mql.addEventListener) mql.addEventListener("change", onChange);
      else if (mql.addListener) mql.addListener(onChange as any);
    }

    return () => {
      isUnmounted = true;
      if (unlistenDrop) unlistenDrop();
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener("change", onChange);
        else if (mql.removeListener) mql.removeListener(onChange as any);
      }
    };
  }, []);

  // 编译用户输入的正则；非法时回退默认并标红输入框
  useEffect(() => {
    try {
      const re = new RegExp(episodeRegexStr);
      setEpisodeRegex(re);
      setEpisodeRegexError(false);
    } catch (e) {
      setEpisodeRegex(new RegExp(defaultEpisodeRegex));
      setEpisodeRegexError(true);
    }
  }, [episodeRegexStr]);

  // 统一提示方法
  const showMessage = (text: string, type: "success" | "error" | "info") => {
    const duration = type === "success" ? 3 : type === "info" ? 3 : 0;
    messageApi.open({ type, content: text, duration });
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

  // 提取两位数剧集编号，如 01、02
  const extractEpisode = (name: string): string | null => {
    const match = name.match(episodeRegex);
    return match ? match[1] : null;
  };

  // 根据当前列表计算对齐的剧集项与缺失信息
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
    const episodes = Array.from(new Set([...vMap.keys(), ...sMap.keys()]))
      .sort((a, b) => Number(a) - Number(b));
    const items = episodes.map((ep) => ({
      episode: ep,
      video: vMap.get(ep),
      subtitle: sMap.get(ep),
    }));
    setEpisodeItems(items);
    setMissingEpisodes(items.filter((it) => !it.subtitle).map((it) => it.episode));
  }, [videoFiles, subtitleFiles]);

  // 同步滚动（左右两栏保持位置一致）
  const syncScroll = (source: "left" | "right") => {
    const left = leftScrollRef.current;
    const right = rightScrollRef.current;
    if (!left || !right) return;
    const from = source === "left" ? left : right;
    const to = source === "left" ? right : left;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    const ratio = fromMax > 0 ? from.scrollTop / fromMax : 0;
    to.scrollTop = ratio * toMax;
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
    // 基于剧集编号的匹配：只重命名成对存在的条目
    const matchedPairs = (() => {
      // 构建 episode -> video/subtitle 的映射
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
      const pairs: { video: FileInfo; subtitle: FileInfo }[] = [];
      const missing: string[] = [];
      for (const ep of episodes) {
        const v = vMap.get(ep);
        const s = sMap.get(ep);
        if (v && s) pairs.push({ video: v, subtitle: s });
        else if (v && !s) missing.push(ep);
      }
      if (missing.length) {
        showMessage(`已跳过缺失字幕的剧集: ${missing.join(", ")}`, "info");
      }
      return pairs;
    })();

    if (matchedPairs.length === 0) {
      showMessage("请先添加视频文件和对应的字幕文件", "error");
      return;
    }

    setLoading(true);
    try {
      const suffix = selectedSuffix || customSuffix;
      const response = await invoke<RenameResponse>("rename_subtitle_files", {
        request: {
          video_files: matchedPairs.map((p) => p.video),
          subtitle_files: matchedPairs.map((p) => p.subtitle),
          suffix,
        },
      });

      if (response.success) {
        // 仅更新参与重命名的字幕项，避免长度不一致导致崩溃
        if (response.renamed_files.length !== matchedPairs.length) {
          showMessage("返回的重命名数量与匹配的文件数量不一致", "error");
        } else {
          const renameMap = new Map<string, string>(); // subtitle.path -> newName
          matchedPairs.forEach((p, idx) => {
            renameMap.set(p.subtitle!.path, response.renamed_files[idx]);
          });
          const updatedSubtitles = subtitleFiles.map((subtitle) => {
            const newName = renameMap.get(subtitle.path);
            if (!newName) return subtitle; // 未参与重命名的保持不变
            const sepIndex = Math.max(
              subtitle.path.lastIndexOf("/"),
              subtitle.path.lastIndexOf("\\")
            );
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

  // 选择文件夹并扫描，其结果覆盖当前列表
  const pickFolder = async () => {
    try {
      const result = await invoke<{ files: FileInfo[]; canceled: boolean }>(
        "pick_directory_and_get_info"
      );
      // 取消选择时不提示，直接返回
      if (result.canceled) return;
      // 每次添加文件夹时，清空原列表
      setVideoFiles([]);
      setSubtitleFiles([]);
      if (result.files && result.files.length) {
        // 过滤：只导入与现有视频剧集编号匹配的字幕，避免后续重命名崩溃
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
      }
      else showMessage("所选文件夹中未找到视频或字幕文件", "info");
    } catch (e) {
      console.error(e);
      showMessage("选择文件夹失败", "error");
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
    { label: "chs", value: "chs" },
    { label: "cht", value: "cht" },
  ];

  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      {contextHolder}
        <Layout
          style={{ minHeight: "100vh", overflow: "hidden", maxHeight: "100vh" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 侧边导航栏 */}
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={(c) => setCollapsed(c)}
            width={220}
            style={{ background: "var(--ant-color-bg-container)" }}
          >
            <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
              {!collapsed && (
                <Text style={{ color: "var(--ant-color-text)", fontWeight: 600 }}>Linear Renamer</Text>
              )}
            </div>
            <div style={{ padding: 8 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button
                  type={activePage === "welcome" ? "primary" : "text"}
                  icon={<HomeOutlined />}
                  block
                  onClick={() => setActivePage("welcome")}
                >
                  {collapsed ? null : "欢迎页"}
                </Button>
                <Button
                  type={activePage === "rename" ? "primary" : "text"}
                  icon={<FileTextOutlined />}
                  block
                  onClick={() => setActivePage("rename")}
                >
                  {collapsed ? null : "字幕重命名"}
                </Button>
              </Space>
            </div>
          </Sider>

          {/* 主体区域 */}
          <Layout>
          { /* 顶部栏：标题与操作按钮（选择文件 / 清空 / 重命名） */ }
          <Header style={{ background: "var(--ant-color-bg-container)", padding: "0 16px" }}>
            <Flex align="center" justify="space-between" style={{ height: "100%" }}>
              <Space>
                <Button
                  type="text"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(!collapsed)}
                />
                <Title level={3} style={{ margin: 0, color: "var(--ant-color-text)" }}>
                  {activePage === "welcome" ? "Linear Renamer" : "字幕重命名"}
                </Title>
              </Space>
              {activePage === "rename" ? (
                <Space>
                  <Button icon={<FolderOpenOutlined />} onClick={pickFiles}>
                    选择文件
                  </Button>
                  <Button icon={<FolderOutlined />} onClick={pickFolder}>
                    选择文件夹
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
              ) : (
                <Space>
                  <Button type="primary" onClick={() => setActivePage("rename")}>开始重命名</Button>
                </Space>
              )}
            </Flex>
          </Header>
          { /* 主内容：上方文件列表（占满剩余空间） + 下方设置区 */ }
          <Content style={{ margin: "16px", display: "flex", flexDirection: "column", gap: "16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
            {activePage === "welcome" && (
              <Welcome onStart={() => setActivePage("rename")} />
            )}
            {activePage === "rename" && (
            <div className="rename-layout">
            {/* 自定义匹配正则 */}
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Text>匹配正则表达式（捕获组1为剧集编号）</Text>
                  <Space.Compact block size="middle">
                    <Input
                      size="middle"
                      status={episodeRegexError ? "error" : undefined}
                      value={episodeRegexStr}
                      onChange={(e) => setEpisodeRegexStr(e.target.value)}
                      placeholder="例如: (?:^|[^0-9])(\\d{2})(?!\\d)"
                    />
                    <Button size="middle" onClick={() => setEpisodeRegexStr(defaultEpisodeRegex)}>重置</Button>
                  </Space.Compact>
                  {/* 预设切换 */}
                    <Segmented
                      options={[
                        { label: "[xx]", value: "\\[(\\d{2})\\]" },
                        { label: "xx", value: "(?:^|[^0-9])(\\d{2})(?!\\d)" },
                        { label: "SxxEyy", value: "S\\d{1,2}E(\\d{2})" },
                        { label: "Eyy/epyy", value: "[Ee][Pp]?(\\d{2})" },
                        { label: "第yy集", value: "第(\\d{2})[集话]" },
                      ]}
                    value={episodeRegexStr}
                    onChange={(val) => setEpisodeRegexStr(String(val))}
                    block
                  />
            </Space>
            <div className="file-lists-container" style={{ flex: 1, minHeight: 0 }}>
              { /* 文件列表区域：左右两列卡片，内部滚动 */ }
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
                          onScroll={() => syncScroll("left")}
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
                          <Tag color="green">{episodeItems.filter((it)=>it.subtitle).length}/{episodeItems.length}</Tag>
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
                          onScroll={() => syncScroll("right")}
                        >
                          <List<{ episode: string; video?: FileInfo; subtitle?: FileInfo }>
                            size="small"
                            bordered
                            dataSource={episodeItems}
                            renderItem={(item) => (
                              <List.Item>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
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
                                      <span className="rename-preview" title={(item.video && item.subtitle) ? ((()=>{ const videoStem = (name:string)=>{const i=name.lastIndexOf('.'); return i>0?name.slice(0,i):name;}; const ext = (name:string)=>{const i=name.lastIndexOf('.'); return i>=0?name.slice(i+1).toLowerCase():'';}; const sfx = (selectedSuffix || customSuffix).trim(); const stem = videoStem(item.video!.name); const e = ext(item.subtitle!.name); return sfx ? `${stem}.${sfx}.${e}` : `${stem}.${e}`; })()) : ''}>
                                        {(() => { const videoStem = (name:string)=>{const i=name.lastIndexOf('.'); return i>0?name.slice(0,i):name;}; const ext = (name:string)=>{const i=name.lastIndexOf('.'); return i>=0?name.slice(i+1).toLowerCase():'';}; const sfx = (selectedSuffix || customSuffix).trim(); const stem = videoStem(item.video!.name); const e = ext(item.subtitle!.name); return sfx ? `${stem}.${sfx}.${e}` : `${stem}.${e}`; })()}
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

            { /* 分隔线 */ }
            <Divider style={{ margin: "8px 0" }} />

            { /* 字幕后缀设置与执行 */ }
            <Card title="字幕语言后缀设置" size="small">
              <Row gutter={[16, 16]} align="middle">
                {/* 自定义后缀输入：占满剩余横向空间 */}
                <Col xs={24} flex="auto">
                  <Space direction="vertical" style={{ width: "100%" }}>
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

                {/* 快速选择与执行按钮同一行 */}
                <Col xs={24} flex="none">
                  <Space direction="vertical">
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
            </div>
            )}
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
      </Layout>
    </ConfigProvider>
  );
};

export default App;
