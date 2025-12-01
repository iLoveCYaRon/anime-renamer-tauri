import React, { useEffect, useState } from 'react';
import './settings.css';
import { Card, Form, Input, Typography, Space, Button, message, Segmented } from 'antd';
import { loadSettings, saveSettings, Settings } from '../api/tauri';

const { Title } = Typography;

export default function SettingsPage() {
  const [form] = Form.useForm<Settings>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const s = await loadSettings();
        form.setFieldsValue(s);
      } catch (e) {
        message.error('加载设置失败');
      }
    };
    init();
  }, [form]);

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const ok = await saveSettings(values);
      if (ok) {
        message.success('设置已保存');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent<Settings>('settings-updated', { detail: values }));
        }
      }
    } catch (e) {
      message.error('保存设置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space>
        <Title level={3} style={{ margin: 0 }}>设置</Title>
      </Space>

      <Card className="section-card" size="small" title="字幕重命名配置">
        <Form form={form} layout="vertical">
          <Form.Item name="episode_regex" label="匹配正则表达式" rules={[{ required: true }]}> 
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Space.Compact block size="middle">
                <Input
                  size="middle"
                  placeholder="例如: (?:^|[^0-9])(\\d{2})(?!\\d)"
                  value={form.getFieldValue('episode_regex')}
                  onChange={(e) => form.setFieldsValue({ episode_regex: e.target.value })}
                />
                <Button size="middle" onClick={() => form.setFieldsValue({ episode_regex: '\\[(\\d{2})\\]' })}>重置</Button>
              </Space.Compact>
              <Segmented
                options={[
                  { label: "[xx]", value: "\\[(\\d{2})\\]" },
                  { label: "xx", value: "(?:^|[^0-9])(\\d{2})(?!\\d)" },
                  { label: "SxxEyy", value: "S\\d{1,2}E(\\d{2})" },
                  { label: "Eyy/epyy", value: "[Ee][Pp]?(\\d{2})" },
                  { label: "第yy集", value: "第(\\d{2})[集话]" },
                ]}
                value={form.getFieldValue('episode_regex')}
                onChange={(val) => form.setFieldsValue({ episode_regex: String(val) })}
                block
              />
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card className="section-card" size="small" title="LLM模型配置">
        <Form form={form} layout="vertical">
          <Form.Item name="model_url" label="模型地址" rules={[{ required: true }]}>
            <Input placeholder="http://localhost:11434/v1/chat/completions" />
          </Form.Item>
          <Form.Item name="model_name" label="模型名称" rules={[{ required: true }]}>
            <Input placeholder="qwen/qwen3-vl-8b" />
          </Form.Item>
        </Form>
      </Card>

      <Space>
        <Button type="primary" onClick={onSave} loading={loading}>保存设置</Button>
      </Space>
    </div>
  );
}
