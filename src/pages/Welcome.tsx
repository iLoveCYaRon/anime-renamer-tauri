import React from "react";
import { Card, Typography, Space, Button, Tag } from "antd";
import { HomeOutlined, FileTextOutlined, FolderOpenOutlined, PlayCircleOutlined, RobotOutlined } from "@ant-design/icons";

const { Title, Paragraph, Text } = Typography;

const Welcome = ({ onStart, onLLMRecognition }: { onStart: () => void; onLLMRecognition?: () => void }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
      <Card style={{ maxWidth: 860, width: "100%" }}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space align="center" size={12}>
            <HomeOutlined />
            <Title level={3} style={{ margin: 0 }}>欢迎使用 Linear Renamer</Title>
          </Space>
          <Paragraph style={{ marginBottom: 0 }}>
            这是一个基于 Tauri + React 的桌面应用，用于将字幕文件批量重命名为与对应视频文件一致的命名规范。
            旨在让你的番剧与收藏库更加整洁统一。
          </Paragraph>

          <div>
            <Title level={5} style={{ marginTop: 8 }}>主要功能</Title>
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Space size={8}>
                <FolderOpenOutlined />
                <Text>支持拖放与文件/文件夹选择，自动识别视频与字幕文件</Text>
              </Space>
              <Space size={8}>
                <PlayCircleOutlined />
                <Text>可配置匹配正则，精准提取剧集编号并对齐列表</Text>
              </Space>
              <Space size={8}>
                <FileTextOutlined />
                <Text>设置字幕语言后缀（如 <Tag>chs</Tag> / <Tag>cht</Tag>），即时预览重命名结果</Text>
              </Space>
            </Space>
          </div>

          <div>
            <Title level={5} style={{ marginTop: 8 }}>快速上手</Title>
            <Paragraph style={{ marginBottom: 0 }}>
              点击下方按钮进入“字幕重命名”页面，选择视频与字幕文件后，设置语言后缀并执行重命名即可。
            </Paragraph>
          </div>

          <div>
            <Title level={5} style={{ marginTop: 8 }}>新功能</Title>
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Space size={8}>
                <RobotOutlined />
                <Text>新增LLM模型识别功能，可智能解析动画视频文件名信息</Text>
              </Space>
            </Space>
          </div>

          <Space>
            <Button type="primary" size="large" onClick={onStart}>开始使用字幕重命名</Button>
            {onLLMRecognition && (
              <Button size="large" icon={<RobotOutlined />} onClick={onLLMRecognition}>LLM模型识别</Button>
            )}
            <Button size="large" onClick={onStart}>我已了解，进入功能页</Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
};

export default Welcome;
