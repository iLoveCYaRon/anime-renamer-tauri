import React, { useState, useCallback, useEffect } from 'react';
import './llm-recognition.css';
import { Card, Button, List, Tag, Space, message, Typography, Flex, AutoComplete, Input, Row, Col } from 'antd';
import { FolderOpenOutlined, FileOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { FileInfo, RecognitionResult } from '../types/llm';
import { getDroppedFiles, pickFilesAndGetInfo, pickDirectoryAndGetInfo, analyzeFilename, batchAnalyzeFilenames, loadSettings, searchBangumiSubjects, getBangumiSubjectDetail, BangumiSubjectDetail } from '../api/tauri';
import { useRef } from 'react';

interface FileItemProps {
  file: FileInfo;
  result: RecognitionResult | null;
  onAnalyze: (file: FileInfo) => void;
}

function FileItem({ file, result, onAnalyze }: FileItemProps) {
  const { Text } = Typography;
  const ext = (name: string) => {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i) : '';
  };
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  const buildPreview = (f: FileInfo, res: RecognitionResult | null) => {
    if (!res || !res.info) return '';
    const info = res.info;
    const title = info.title.trim();
    const epPart = `.S${pad2(info.season)}E${pad2(info.episode)}`;
    const group = info.group ? `.${info.group} ` : '';
    const codec = info.codec ? ` .${info.codec}` : '';
    const langs = info.language_tags ? `.${info.language_tags}` : '';
    const base = `${title}${epPart}${group}${codec}${langs}`;
    return `${base}${ext(f.name)}`;
  };
  const renderMetaLine = (res: RecognitionResult | null) => {
    const info = res?.info || null;
    return (
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {info && (
          <Space size="small" wrap>
            <Tag color="blue">{info.title}</Tag>
            <Tag color="green">{`S${pad2(info.season)}E${pad2(info.episode)}`}</Tag>
            {info.codec && <Tag color="cyan">{info.codec}</Tag>}
            {info.group && <Tag color="magenta">{info.group}</Tag>}
            {info.language_tags && <Tag color="gold">{info.language_tags}</Tag>}
          </Space>
        )}
        {res?.error && (
          <Text type="danger">{res.error}</Text>
        )}
      </div>
    );
  };

  return (

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <Text ellipsis>{file.path}</Text>
        <Text ellipsis>{buildPreview(file, result) || '暂无预览'}</Text>
        {renderMetaLine(result)}
      </div>

  );
}

export default function LLMRecognition() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [results, setResults] = useState<Map<string, RecognitionResult>>(new Map());
  const [modelUrl, setModelUrl] = useState('http://localhost:11434/v1/chat/completions');
  const [modelName, setModelName] = useState('qwen2.5:7b');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<BangumiSubjectDetail | null>(null);
  const searchAreaRef = useRef<HTMLDivElement | null>(null);
  const fileListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const s = await loadSettings();
        setModelUrl(s.model_url);
        setModelName(s.model_name);
      } catch {}
    };
    init();
  }, []);

  const sortFiles = (arr: FileInfo[]) => arr.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const handlePickFiles = async () => {
    try {
      const pickedFiles = await pickFilesAndGetInfo();
      setFiles(prev => sortFiles([...prev, ...pickedFiles]));
      message.success(`成功选择 ${pickedFiles.length} 个文件`);
    } catch (error) {
      message.error(`选择文件失败: ${error}`);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const result = await pickDirectoryAndGetInfo();
      if (!result.canceled) {
        setFiles(prev => sortFiles([...prev, ...result.files]));
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

  const handleSearch = useCallback(async (value: string) => {
    setSearchQuery(value);
    const q = value.trim();
    if (!q) {
      setSearchOptions([]);
      return;
    }
    try {
      const subjects = await searchBangumiSubjects(q, 10);
      const opts = subjects.map(s => ({
        value: String(s.id),
        label: `${s.name_cn || s.name} ${s.date ? `(${s.date})` : ''}`.trim(),
      }));
      setSearchOptions(opts);
    } catch (e) {
      setSearchOptions([]);
    }
  }, []);

  const handleSelectSubject = (value: string) => {
    const item = searchOptions.find(o => o.value === value);
    if (!item) return;
    const id = Number(value);
    getBangumiSubjectDetail(id)
      .then((detail) => {
        setSelectedDetail(detail);
      })
      .catch(() => {
        setSelectedDetail(null);
      });
  };

  const handleInferAnimeFromFiles = async () => {
    const videoFiles = files.filter(f => f.is_video);
    const candidates = (videoFiles.length > 0 ? videoFiles : files)
      .slice()
      .sort((a, b) => b.name.length - a.name.length)
      .slice(0, 10);

    if (candidates.length === 0) {
      message.warning('请先导入文件后再识别');
      return;
    }

    try {
      // 使用新的批量分析API
      const filenames = candidates.map(f => f.name);
      const response = await batchAnalyzeFilenames({
        filenames,
        model_url: modelUrl,
        model_name: modelName,
      });

      if (response.success && response.data) {
        const { anime_title, confidence } = response.data;
        
        if (!anime_title || anime_title.trim() === '') {
          message.error('无法识别列表文件对应的动画');
          return;
        }

        // 设置搜索查询
        const query = anime_title.trim();
        setSearchQuery(query);
        
        // 搜索 Bangumi
        try {
          const list = await searchBangumiSubjects(query, 10);
          const opts = list.map(s => ({ 
            value: String(s.id), 
            label: `${s.name_cn || s.name} ${s.date ? `(${s.date})` : ''}`.trim() 
          }));
          setSearchOptions(opts);
          
          if (list.length > 0) {
            const detail = await getBangumiSubjectDetail(list[0].id);
            setSelectedDetail(detail);
            message.success(`成功识别动画: ${query} (置信度: ${Math.round(confidence * 100)}%)`);
            
            // 获取Bangumi中文标题
            const bangumiTitle = detail.name_cn || detail.name;
            
            // 对文件逐个调用分析方法获取原信息并显示重命名预览
            message.info('开始分析文件信息...');
            let analyzedCount = 0;
            let successCount = 0;
            
            for (const file of files) {
              if (!file.is_video) continue;
              
              try {
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
                
                // 调用分析API获取文件信息
                const fileResponse = await analyzeFilename({
                  filename: file.name,
                  model_url: modelUrl,
                  model_name: modelName,
                });
                
                analyzedCount++;
                
                if (fileResponse.success && fileResponse.data) {
                  // 使用Bangumi标题替换原标题
                  const updatedInfo = {
                    ...fileResponse.data,
                    title: bangumiTitle
                  };
                  
                  setResults(prev => {
                    const newResults = new Map(prev);
                    newResults.set(file.path, {
                      file,
                      info: updatedInfo,
                      loading: false,
                      error: null,
                    });
                    return newResults;
                  });
                  
                  successCount++;
                } else {
                  setResults(prev => {
                    const newResults = new Map(prev);
                    newResults.set(file.path, {
                      file,
                      info: null,
                      loading: false,
                      error: fileResponse.error || '识别失败',
                    });
                    return newResults;
                  });
                }
                
                // 添加小延迟避免并发请求过多
                await new Promise(resolve => setTimeout(resolve, 300));
                
              } catch (error) {
                setResults(prev => {
                  const newResults = new Map(prev);
                  newResults.set(file.path, {
                    file,
                    info: null,
                    loading: false,
                    error: `分析错误: ${error}`,
                  });
                  return newResults;
                });
              }
            }
            
            if (successCount > 0) {
              message.success(`文件分析完成！成功识别 ${successCount}/${analyzedCount} 个文件，使用标题: ${bangumiTitle}`);
            } else {
              message.warning(`文件分析完成，但未成功识别任何文件信息`);
            }
            
          } else {
            setSelectedDetail(null);
            message.warning('未在 Bangumi 找到匹配动画');
          }
        } catch (e) {
          setSelectedDetail(null);
          message.error('获取动画详情失败');
        }
      } else {
        message.error(response.error || '无法识别列表文件对应的动画');
      }
    } catch (error) {
      message.error(`批量识别失败: ${error}`);
    }
  };

  const handleClearFiles = () => {
    setFiles([]);
    setResults(new Map());
    message.success('已清空文件列表');
  };

  useEffect(() => {}, []);

  return (
    <div className="llm-page page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Flex align="center" justify="space-between" style={{ width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>BDRip重命名</Typography.Title>
        <Space>
          <Button icon={<FolderOpenOutlined />} onClick={handlePickDirectory} aria-label="选择文件夹">
            选择文件夹
          </Button>
        </Space>
      </Flex>

      <Card className="section-card" size="small"
        title={
          <Space>
            <SearchOutlined />
            选择动画作品
          </Space>
        }
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 360, width: 'min(560px, 48vw)' }}>
            {files.some(f => f.is_video) || files.length > 0 ? (
              <Button style={{height: 28}} type="primary" onClick={handleInferAnimeFromFiles} aria-label="自动识别">自动识别</Button>
            ) : null}
            <AutoComplete
              options={searchOptions}
              style={{ width: '100%' }}
              onSearch={handleSearch}
              onSelect={handleSelectSubject}
              value={searchQuery}
            >
              <Input style={{height: 28}} allowClear prefix={<SearchOutlined />} placeholder="搜索动画（调用 Bangumi）" />
            </AutoComplete>
          </div>
        }
      >
        <div ref={searchAreaRef}>
        {selectedDetail ? (
          <div className="bangumi-detail-card">
            <div className="bangumi-detail-content">
              <div className="bangumi-cover">
                <div className="cover-box">
                  {selectedDetail.cover_url ? (
                    <img src={selectedDetail.cover_url} alt={selectedDetail.name_cn || selectedDetail.name} />
                  ) : null}
                </div>
              </div>
              <div className="bangumi-info">
                <div className="bangumi-title-cn">{selectedDetail.name_cn || selectedDetail.name}</div>
                <div className="bangumi-title-en">{selectedDetail.name}</div>
                <div className="bangumi-meta">
                  {typeof selectedDetail.episodes === 'number' && (
                    <span>共{selectedDetail.episodes}集</span>
                  )}
                  {typeof selectedDetail.year === 'number' && (
                    <span>{selectedDetail.year}年</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bangumi-detail-card">
            <div style={{ padding: 12 }}>
              <Typography.Text type="secondary">暂未匹配动画作品</Typography.Text>
            </div>
          </div>
        )}
        </div>
      </Card>

      <Card className="section-card section-card--list" size="small"
        title={
          <Space>
            <PlayCircleOutlined />
            文件列表
            {files.length > 0 && (
              <Tag color="blue">{files.length}</Tag>
            )}
          </Space>
        }
        extra={
          files.length > 0 ? (
            <Button style={{height: 28}} type="primary" danger onClick={handleClearFiles} aria-label="清空文件列表">清空</Button>
          ) : null
        }
      >
        <div ref={fileListRef} className={`list-body ${files.length === 0 ? 'empty' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {files.length === 0 ? (
            <List locale={{ emptyText: '暂无文件' }} />
          ) : (
            <div className="list-scroll" style={{ flex: 1, overflowY: 'auto', width: '100%' }}>
              <Row gutter={[8, 8]}>
                {files.map((file) => (
                  <Col span={24} key={file.path}>
                    <div className="row-item">
                      <FileItem
                        file={file}
                        result={results.get(file.path) || null}
                        onAnalyze={handleAnalyze}
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
