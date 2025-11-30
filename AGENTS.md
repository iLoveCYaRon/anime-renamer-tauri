
# AGENTS.md - 动漫重命名工具项目指南

## 项目概述

基于 Tauri 2 + React 19 的跨平台桌面应用，主打两个流程：1) 按剧集号批量重命名字幕文件以匹配对应视频；2) 通过本地/自托管 LLM 分析 BDRip 文件名并联动 Bangumi 搜索，生成规范化预览。默认深色主题，使用 Ant Design 组件库。

## 技术栈

- **前端**: React 19 + TypeScript 5.8、Ant Design 6、Rsbuild 构建、原生 CSS；Hook 管理状态，侧边栏内嵌多页面（欢迎页 / 字幕重命名 / LLM 识别 / 设置）。
- **后端(Tauri)**: Rust 1.77.2+，命令暴露给前端；依赖 reqwest + serde 做 HTTP/序列化，regex 解析，tauri-plugin-fs/dialog/log 提供文件选择、日志与拖放。
- **工具链**: pnpm、@tauri-apps/cli 2.5.0；设置持久化到仓库根的 `settings.json`。

## 仓库结构

```Plaintext
根/
├── src/                # 前端 React
│   ├── App.tsx         # 全局布局，侧边导航与页面切换
│   ├── App.css
│   ├── api/tauri.ts    # 与 Tauri 命令的桥接封装
│   ├── components/
│   │   └── AntdThemeProvider.tsx
│   ├── pages/
│   │   ├── Welcome.tsx           # 入口介绍
│   │   ├── Rename.tsx + rename.css# 字幕重命名页面
│   │   ├── LLMRecognition.tsx + llm-recognition.css # BDRip/LLM 识别
│   │   ├── Settings.tsx + settings.css # 设置
│   └── types/llm.ts    # 前端共享类型
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # 命令注册与插件挂载
│   │   ├── rename.rs           # 字幕重命名与拖放解析
│   │   ├── llm_recognition.rs  # LLM 调用与 Bangumi 查询
│   │   ├── settings.rs         # 设置读写 (settings.json)
│   │   ├── utils.rs            # 扩展名判断、路径工具
│   │   └── types.rs            # 后端数据结构
│   └── Cargo.toml, tauri.conf.json
├── settings.json       # 运行后生成/覆盖的配置文件
└── rsbuild.config.ts, tsconfig.json, package.json, README.md
```

## 页面与核心逻辑

- **字幕重命名 (`src/pages/Rename.tsx`)**
  - 支持 Tauri 原生拖放 (`get_dropped_files`) 与文件/文件夹选择；文件夹导入仅收集视频并按剧集号过滤对应字幕。
  - 剧集匹配用可配置正则，默认 `\[(\d{2})\]`，可在设置页修改并写入 settings.json；双列按剧集预览。
  - 后缀可选 chs/cht 或自定义；调用 `rename_subtitle_files` 按索引配对重命名，缺字幕提示跳过，目标存在即中止。
  - 交互：全屏拖放遮罩、左右列表滚动联动、清空按钮、Ctrl+R 快捷提示。
- **BDRip/LLM 识别 (`src/pages/LLMRecognition.tsx`)**
  - 目录选择导入视频（或多选文件）；可单个 `analyze_filename`，或自动识别触发 `batch_analyze_filenames` 推断番名后逐个解析。
  - 模型地址/名称来自设置页 (`model_url`/`model_name`)，期望兼容 OpenAI Chat Completions 协议。
  - Bangumi：搜索命令取候选，详情命令展示封面/标题/年份/集数；预览 = 标题 + `S01E##` + 压制组/编码。
- **设置 (`src/pages/Settings.tsx`)**
  - 配置：episode_regex、model_url、model_name；保存=save_settings，加载=load_settings。
  - 存储于仓库根 settings.json，`pnpm tauri` 默认忽略热更。
- **欢迎页 (`src/pages/Welcome.tsx`)**
  - 入口引导，按钮跳转到重命名或 LLM 识别。

## Tauri 命令 & 数据结构

- **命令**：`get_dropped_files`, `rename_subtitle_files`, `pick_files_and_get_info`, `pick_directory_and_get_info`, `analyze_filename`, `batch_analyze_filenames`, `search_bangumi_subjects`, `get_bangumi_subject_detail`, `load_settings`, `save_settings`。
- **关键类型（后端定义，前端同名）**
  - FileInfo { name, path, is_video }
  - RenameRequest { video_files, subtitle_files, suffix } → RenameResponse { success, message, renamed_files }
  - LLMRequest { filename, model_url, model_name } / LLMResponse { success, data?: AnimeInfo, error?: string }
  - BatchLLMRequest { filenames, model_url, model_name } / BatchLLMResponse { success, data?: AnimeInfo }
  - BangumiSubject { id, name, name_cn?, date? } / BangumiSubjectDetail { id, name, name_cn?, cover_url?, episodes?, year? }
  - Settings { episode_regex, model_url, model_name }，DirectoryPickResult { files, canceled }

## 运行与构建

```bash
pnpm install
pnpm dev          # 前端开发（Rsbuild）
pnpm tauri        # Tauri 开发模式（已忽略 settings.json 变动）
pnpm build        # 前端构建
pnpm tauri build  # 打包桌面应用
```

## 注意事项

- 仅在 path 为完整路径时落盘重命名；只含文件名则仅返回预览。
- LLM 与 Bangumi 查询需要可访问的网络；模型接口需兼容 OpenAI Chat Completions JSON 语义。
- 支持的视频/字幕后缀：视频 mp4/mkv/avi/mov/wmv/flv/webm/m4v/mpeg/mpg/ts/mts/m2ts；字幕 srt/ass/ssa/sub/idx/vtt/txt。
- settings.json 存在仓库根，请慎提交；开发脚本默认忽略该文件。
