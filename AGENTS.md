# AGENTS.md - 动漫重命名工具项目指南

## 项目概述

这是一个基于Tauri + React的跨平台桌面应用，专门用于批量重命名字幕文件，使其与对应的视频文件保持一致的命名规范。项目名称"Skyey Liner Renamer"，主要服务于动漫爱好者和视频收藏者。

## 技术栈分析

### 前端技术栈
- **框架**: React 19.1.0 + TypeScript
- **构建工具**: Rsbuild (替代Webpack的现代构建工具)
- **样式**: 原生CSS，采用深色主题设计
- **状态管理**: React Hooks (useState, useEffect)
- **Tauri集成**: @tauri-apps/api 2.9.0

### 后端技术栈
- **运行时**: Tauri 2.5.0 (Rust-based)
- **语言**: Rust 1.77.2+
- **日志**: tauri-plugin-log 2.0.0-rc
- **序列化**: serde + serde_json

### 开发环境
- **包管理**: pnpm
- **类型检查**: TypeScript 5.8.3
- **代码规范**: 严格模式，无未使用变量检查

## 核心功能

### 1. 文件拖放处理
- **Tauri原生拖放**: 支持从文件系统直接拖放文件到应用窗口
- **文件类型识别**: 自动区分视频文件和字幕文件
- **批量处理**: 支持同时拖放多个文件

### 2. 文件类型支持
- **视频格式**: mp4, mkv, avi, mov, wmv, flv, webm, m4v, rmvb, 3gp, mpeg, mpg, ts, mts, m2ts
- **字幕格式**: srt, ass, ssa, sub, idx, vtt, txt

### 3. 重命名规则
- **基础命名**: 字幕文件名 = 视频文件名 + 语言后缀 + 原扩展名
- **预设后缀**: CHS(简体), CHT(繁体), ENG(英文), CHS&CHT(双语), ZH(中文), JP(日文)
- **自定义后缀**: 支持用户输入任意语言标识

### 4. 用户界面
- **深色主题**: 现代化的深色界面设计
- **拖放提示**: 全屏拖放遮罩层，提供视觉反馈
- **状态反馈**: 实时显示操作结果和错误信息
- **文件列表**: 分别显示视频和字幕文件清单

## 代码架构

### 前端架构 (src/)
```
src/
├── App.tsx          # 主组件，包含核心业务逻辑
├── TicTacToe.tsx    # 示例组件（未使用）
├── App.css          # 样式文件
├── index.tsx        # 应用入口
└── env.d.ts         # 类型声明
```

### 后端架构 (src-tauri/src/)
```
src-tauri/src/
├── main.rs    # 应用入口点
└── lib.rs     # 核心业务逻辑和Tauri命令
```

### 关键数据结构
```typescript
// 文件信息接口
interface FileInfo {
    name: string;      // 文件名
    path: string;      // 完整路径
    is_video: boolean; // 是否为视频文件
}

// 重命名请求接口
interface RenameRequest {
    video_files: FileInfo[];    // 视频文件列表
    subtitle_files: FileInfo[]; // 字幕文件列表
    suffix: string;              // 语言后缀
}

// 重命名响应接口
interface RenameResponse {
    success: boolean;        // 操作是否成功
    message: string;         // 结果消息
    renamed_files: string[]; // 重命名后的文件名列表
}
```

## 开发指南

### 环境搭建
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 启动Tauri开发模式
pnpm tauri
```

### 构建发布
```bash
# 构建前端
pnpm build

# 构建Tauri应用
pnpm tauri build
```

### 代码规范
- TypeScript严格模式开启
- 禁止使用未使用的变量和参数
- 使用函数式组件和Hooks
- 错误处理和用户反馈必须完善

## 功能扩展建议

### 1. 国际化支持
- 添加多语言界面支持
- 支持不同地区的命名习惯

### 2. 高级重命名规则
- 支持正则表达式匹配
- 自定义命名模板
- 批量预览功能

### 3. 文件管理增强
- 文件夹递归处理
- 文件备份机制
- 操作历史记录

### 4. 用户体验优化
- 快捷键支持 (已实现Ctrl+R)
- 进度条显示
- 文件排序和筛选

## 注意事项

### 安全限制
- 浏览器环境无法获取完整文件路径，必须使用Tauri拖放
- 文件选择器仅作演示用途，实际重命名需要完整路径
- 重命名操作前会检查文件是否存在和目标文件是否已存在

### 错误处理
- 文件数量不匹配时给出明确提示
- 文件不存在时阻止操作
- 重命名失败时提供详细错误信息
- 所有异步操作都有try-catch保护

### 性能考虑
- 文件列表使用Map去重，避免重复处理
- 状态更新使用函数式形式，确保获取最新状态
- 事件监听器在组件卸载时正确清理

## 项目状态

当前版本为开发阶段(WIP)，已实现核心功能：
- ✅ 文件拖放识别
- ✅ 视频/字幕文件分类
- ✅ 批量重命名功能
- ✅ 多种语言后缀支持
- ✅ 深色主题界面
- ✅ 状态反馈机制

待完善功能：
- 🔄 更多文件格式支持
- 🔄 国际化界面
- 🔄 高级重命名规则
- 🔄 操作历史记录