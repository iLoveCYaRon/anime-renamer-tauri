import React, { useState, useCallback } from 'react';
import { Card, Button, List, Tag, Space, message, Row, Col, Input, Form, Typography, Flex } from 'antd';
import { FolderOpenOutlined, FileOutlined, PlayCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { FileInfo, RecognitionResult } from '../types/llm';
import { getDroppedFiles, pickFilesAndGetInfo, pickDirectoryAndGetInfo, analyzeFilename } from '../api/tauri';

interface FileItemProps {
  file: FileInfo;
  result: RecognitionResult | null;
  onAnalyze: (file: FileInfo) => void;
}

function FileItem({ file, result, onAnalyze }: FileItemProps) {
  const { Text } = Typography;
  const renderTags = (res: RecognitionResult | null) => {
    if (!res || !res.info) return null;
    const info = res.info;
    return (
      <div style={{ marginTop: 8 }}>
        <Space size="small" wrap>
          <Tag color="blue">{info.title}</Tag>
          <Tag color="green">S{info.season}E{info.episode}</Tag>
          {info.special_type && <Tag color="orange">{info.special_type}</Tag>}
          <Tag color="purple">{info.resolution}</Tag>
          <Tag color="cyan">{info.codec}</Tag>
          <Tag color="magenta">{info.group}</Tag>
          {info.language_tags.map((tag, index) => (
            <Tag key={index} color="gold">{tag}</Tag>
          ))}
          <Tag color={info.confidence > 0.8 ? "success" : "warning"}>
            置信度 {(info.confidence * 100).toFixed(1)}%
          </Tag>
        </Space>
      </div>
    );
  };

  return (
    <List.Item
      actions={[
        <Button
          aria-label="识别此视频文件"
          type="primary"
          size="small"
          onClick={() => onAnalyze(file)}
          loading={result?.loading}
          disabled={!file.is_video}
        >
          识别
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <Space>
          <Tag>{file.is_video ? 'VIDEO' : 'SUB'}</Tag>
          <Text ellipsis>{file.name}</Text>
        </Space>
        <Text type="secondary" ellipsis>{file.path}</Text>
        {renderTags(result)}
        {result?.error && (
          <Text type="danger" style={{ marginTop: 6 }}>{result.error}</Text>
        )}
      </div>
    </List.Item>
  );
}

export default function LLMRecognition() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [results, setResults] = useState<Map<string, RecognitionResult>>(new Map());
  const [modelUrl, setModelUrl] = useState('http://localhost:11434/v1/chat/completions');
  const [modelName, setModelName] = useState('qwen2.5:7b');
  

  

  const handlePickFiles = async () => {
    try {
      const pickedFiles = await pickFilesAndGetInfo();
      setFiles(prev => [...prev, ...pickedFiles]);
      message.success(`成功选择 ${pickedFiles.length} 个文件`);
    } catch (error) {
      message.error(`选择文件失败: ${error}`);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const result = await pickDirectoryAndGetInfo();
      if (!result.canceled) {
        setFiles(prev => [...prev, ...result.files]);
        message.success(`成功导入 ${result.files.length} 个文件`);
      }
    } catch (error) {
      message.error(`选择文件夹失败: ${error}`);
    }
  };

  const handleAnalyze = async (file: FileInfo) => {
    if (!file.is_video) {
      message.warning('只能识别视频文件');
      return;
    }

    // 设置加载状态
    setResults(prev => {
      const newResults = new Map(prev);
      const existing = newResults.get(file.path);
      newResults.set(file.path, {
        file,
        info: existing?.info || null,
        loading: true,
        error: null,
      });
      return newResults;
    });

    try {
      const response = await analyzeFilename({
        filename: file.name,
        model_url: modelUrl,
        model_name: modelName,
      });

      setResults(prev => {
        const newResults = new Map(prev);
        newResults.set(file.path, {
          file,
          info: response.data || null,
          loading: false,
          error: response.error || null,
        });
        return newResults;
      });

      if (response.success && response.data) {
        message.success(`成功识别: ${file.name}`);
      } else {
        message.error(`识别失败: ${response.error}`);
      }
    } catch (error) {
      setResults(prev => {
        const newResults = new Map(prev);
        newResults.set(file.path, {
          file,
          info: null,
          loading: false,
          error: `识别错误: ${error}`,
        });
        return newResults;
      });
      message.error(`识别错误: ${error}`);
    }
  };

  const handleAnalyzeAll = async () => {
    const videoFiles = files.filter(file => file.is_video);
    if (videoFiles.length === 0) {
      message.warning('没有视频文件需要识别');
      return;
    }

    for (const file of videoFiles) {
      await handleAnalyze(file);
      // 添加小延迟避免并发请求过多
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const videoFiles = files.filter(file => file.is_video);
  const subtitleFiles = files.filter(file => !file.is_video);

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Flex align="center" justify="space-between" style={{ width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>LLM模型识别</Typography.Title>
        <Space>
          <Button icon={<FileOutlined />} onClick={handlePickFiles} aria-label="选择文件">
            选择文件
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={handlePickDirectory} aria-label="选择文件夹">
            选择文件夹
          </Button>
        </Space>
      </Flex>

      <Card className="section-card llm-config-card" size="small" title="LLM模型配置">
        <Form layout="vertical">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item label="模型地址">
                <Input
                  aria-label="模型地址"
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1/chat/completions"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="模型名称">
                <Input
                  aria-label="模型名称"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="qwen2.5:7b"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      

      <div className="file-lists-container" style={{ flex: 1, minHeight: 0 }}>
        <Row className="file-row" gutter={[12, 0]} style={{ flex: 1, minHeight: 0 }} align="stretch">
          <Col className="file-col file-col--video" xs={24} md={12} style={{ height: '100%' }}>
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
              extra={
                videoFiles.length > 0 ? (
                  <Button type="primary" onClick={handleAnalyzeAll} aria-label="批量识别所有视频">批量识别所有视频</Button>
                ) : null
              }
              style={{ height: '100%' }}
            >
              <div className={`list-body ${videoFiles.length === 0 ? 'empty' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {videoFiles.length === 0 ? (
                  <List locale={{ emptyText: '暂无视频文件' }} />
                ) : (
                  <div className="list-scroll" style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
                    <List<FileInfo>
                      size="small"
                      bordered
                      dataSource={videoFiles}
                      renderItem={(file) => (
                        <FileItem
                          key={file.path}
                          file={file}
                          result={results.get(file.path) || null}
                          onAnalyze={handleAnalyze}
                        />
                      )}
                    />
                  </div>
                )}
              </div>
            </Card>
          </Col>

          <Col className="file-col file-col--subtitle" xs={24} md={12} style={{ height: '100%' }}>
            <Card className="section-card" size="small"
              title={
                <Space>
                  <FileTextOutlined />
                  字幕文件
                  {files.length > 0 && (
                    <Tag color="green">{subtitleFiles.length}</Tag>
                  )}
                </Space>
              }
              style={{ height: '100%' }}
            >
              <div className={`list-body ${subtitleFiles.length === 0 ? 'empty' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {subtitleFiles.length === 0 ? (
                  <List locale={{ emptyText: '暂无字幕文件' }} />
                ) : (
                  <div className="list-scroll" style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
                    <List<FileInfo>
                      size="small"
                      bordered
                      dataSource={subtitleFiles}
                      renderItem={(file) => (
                        <List.Item>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                            <Space>
                              <Tag>SUB</Tag>
                              <Typography.Text ellipsis>{file.name}</Typography.Text>
                            </Space>
                            <Typography.Text type="secondary" ellipsis>{file.path}</Typography.Text>
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
    </div>
  );
}
