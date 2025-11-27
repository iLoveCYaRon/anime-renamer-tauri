// 应用入口组件：负责文件拖放/选择、列表展示与字幕重命名
import React, { useState, useEffect } from "react";
import {
  Button,
  Layout,
  Space,
  Typography,
  ConfigProvider,
  theme,
} from "antd";
import {
  FileTextOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RobotOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import "./App.css";
import Welcome from "./pages/Welcome";
import LLMRecognition from "./pages/LLMRecognition";
import Rename from "./pages/Rename";
import SettingsPage from "./pages/Settings";

const { Content, Sider } = Layout;
const { Text } = Typography;

 

const App = () => {
  const [activePage, setActivePage] = useState<"welcome" | "rename" | "llm-recognition" | "settings">("welcome");
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  useEffect(() => {
    const mql = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    if (mql) {
      if (mql.addEventListener) mql.addEventListener("change", onChange);
      else if (mql.addListener) mql.addListener(onChange as any);
    }
    return () => {
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener("change", onChange);
        else if (mql.removeListener) mql.removeListener(onChange as any);
      }
    };
  }, []);

  

  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
        <Layout
          style={{ minHeight: "100vh", overflow: "hidden", maxHeight: "100vh" }}
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
              <Space orientation="vertical" style={{ width: "100%" }}>
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
                <Button
                  type={activePage === "llm-recognition" ? "primary" : "text"}
                  icon={<RobotOutlined />}
                  block
                  onClick={() => setActivePage("llm-recognition")}
                >
                  {collapsed ? null : "LLM识别"}
                </Button>
                <Button
                  type={activePage === "settings" ? "primary" : "text"}
                  icon={<SettingOutlined />}
                  block
                  onClick={() => setActivePage("settings")}
                >
                  {collapsed ? null : "设置"}
                </Button>
              </Space>
            </div>
          </Sider>

          {/* 主体区域 */}
          <Layout>
          <Content style={{ margin: "16px", display: "flex", flexDirection: "column", gap: "16px", flex: 1, minHeight: 0, overflow: "hidden" }}>
            {activePage === "welcome" && (
              <Welcome onStart={() => setActivePage("rename")} onLLMRecognition={() => setActivePage("llm-recognition")} />
            )}
            {activePage === "llm-recognition" && (
              <LLMRecognition />
            )}
            {activePage === "rename" && (
              <Rename />
            )}
            {activePage === "settings" && (
              <SettingsPage />
            )}
          </Content>

          
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
