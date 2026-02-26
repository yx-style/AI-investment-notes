# 第一步：实时转录与结构化笔记 — 实现方案

## 背景

你是一名投研研究员，经常带笔记本出去访谈/交流。希望有一个工具能：
- **实时转录**对话内容（走神时可以回看之前聊了什么）
- **实时结构化**转录内容为清晰的笔记（方便快速浏览和接着提问）

类似 Typeless / Granola 的体验，但专为投研访谈场景设计。

---

## 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 前端 | **React 19 + Vite** | 轻量、快速，适合单页工具型应用 |
| 后端 | **Node.js + Express** | WebSocket 代理，保护 API Key |
| 语音转文字 | **Deepgram Nova-3** | 真正的实时 WebSocket 流式转录；中文支持好（zh-CN/zh-TW）；支持中英混合（`language=multi`）；延迟 <300ms；$200 免费额度；JS SDK 简单易用 |
| 笔记结构化 | **Claude API（Haiku 4.5）** | 速度快、成本低；支持 structured output（JSON schema）；中文能力强 |
| 传输 | **WebSocket** | 音频流 + 转录结果双向传输 |

### 为什么选 Deepgram 而不是其他？
- AssemblyAI：中文**不支持**实时流式转录（仅支持英/西/法/德/意/葡）
- OpenAI Whisper Realtime API：不是真正的实时流，需要等说话停顿才返回结果
- Azure Speech：中文支持好但价格是 Deepgram 的 2 倍，且 Azure 生态锁定
- Google Cloud：中文流式转录有已知 bug（Chirp 2 模型）
- Web Speech API：仅 Chrome，不支持中英混合，60 秒自动停止，不适合生产

---

## 架构设计

```
浏览器（你的笔记本）
  │
  ├── getUserMedia() → MediaRecorder（250ms 音频块）
  │                         │
  │                    WebSocket ──────→ Node.js 后端
  │                   （音频流）              │
  │                                    WebSocket ──→ Deepgram API
  │                                   （音频流）     （实时转录）
  │                                         │
  │                                    WebSocket ←── Deepgram API
  │                                   （转录文本）   （partial + final 结果）
  │                                         │
  │                                    每 3-5 分钟 ──→ Claude API
  │                                   （结构化处理）    （Haiku 4.5）
  │                                         │
  │  ←─────────────── WebSocket ────────────┘
  │                （转录文本 + 结构化笔记）
  │
  ├── 左侧面板：实时转录文本（滚动显示）
  └── 右侧面板：结构化笔记（定期更新）
```

---

## UI 布局

```
┌──────────────────────────────────────────────────────┐
│  📋 投研访谈助手          [● 录音中]  [⏹ 停止]      │
├──────────────────────────┬───────────────────────────┤
│                          │                           │
│  实时转录                │  结构化笔记               │
│  ─────────               │  ─────────               │
│                          │                           │
│  [14:32] 对方：我们公司   │  ## 讨论主题              │
│  去年的营收增长了 30%...  │  - 公司营收增长情况        │
│                          │  - 未来扩张计划            │
│  [14:33] 对方：主要是    │                           │
│  因为海外市场的拓展...    │  ## 关键信息              │
│                          │  - 去年营收增长 30%        │
│  [14:35] 你：那今年的    │  - 增长来源：海外市场拓展   │
│  预期呢？                │                           │
│                          │  ## 待跟进问题             │
│  [正在说...] ████        │  - 今年营收预期？          │
│                          │                           │
├──────────────────────────┴───────────────────────────┤
│  手动笔记区（可选，你可以随手记几个关键词）            │
└──────────────────────────────────────────────────────┘
```

---

## 文件结构

```
AI-investment-notes/
├── package.json
├── vite.config.js
├── .env.example            # API Key 模板（不提交真实 key）
├── server/
│   ├── index.js            # Express + WebSocket 后端入口
│   ├── deepgram.js         # Deepgram WebSocket 连接管理
│   └── claude.js           # Claude API 结构化笔记调用
├── src/
│   ├── main.jsx            # React 入口
│   ├── App.jsx             # 主应用组件
│   ├── App.css             # 全局样式
│   ├── components/
│   │   ├── TranscriptPanel.jsx   # 左侧实时转录面板
│   │   ├── NotesPanel.jsx        # 右侧结构化笔记面板
│   │   ├── RecordingControls.jsx # 录音控制按钮
│   │   └── ManualNotes.jsx       # 底部手动笔记区
│   ├── hooks/
│   │   ├── useAudioCapture.js    # 麦克风音频捕获
│   │   └── useWebSocket.js       # WebSocket 连接管理
│   └── utils/
│       └── formatTime.js         # 时间格式化工具
└── index.html
```

---

## 实现步骤

### Step 1: 项目初始化
- 用 Vite 创建 React 项目
- 安装依赖：`@deepgram/sdk`, `ws`, `express`, `@anthropic-ai/sdk`, `dotenv`
- 创建 `.env.example` 文件

### Step 2: 后端 — WebSocket 代理服务器
- `server/index.js`：Express 服务器 + WebSocket 升级
- `server/deepgram.js`：连接 Deepgram WebSocket API
  - 接收浏览器音频流 → 转发给 Deepgram
  - 接收 Deepgram 转录结果 → 转发给浏览器
  - 处理 interim（临时）和 final（最终）结果
  - 使用 `language=multi` 支持中英混合
- `server/claude.js`：调用 Claude API 生成结构化笔记
  - 累积转录文本，每 3 分钟或手动触发时调用
  - 使用 Haiku 4.5 + structured output
  - 返回 JSON 格式的结构化笔记

### Step 3: 前端 — 音频捕获
- `useAudioCapture` hook：
  - `getUserMedia()` 获取麦克风权限
  - `MediaRecorder` 每 250ms 生成一个音频块
  - 通过 WebSocket 发送到后端

### Step 4: 前端 — 实时转录显示
- `TranscriptPanel` 组件：
  - 接收 WebSocket 转录事件
  - 区分 interim（浅色/斜体）和 final（正常）文本
  - 自动滚动到最新内容
  - 显示时间戳

### Step 5: 前端 — 结构化笔记显示
- `NotesPanel` 组件：
  - 接收结构化笔记更新
  - 渲染 Markdown 格式的笔记
  - 分类显示：讨论主题 / 关键信息 / 数据要点 / 待跟进问题
  - 支持手动点击"立即更新"按钮

### Step 6: 前端 — 录音控制与手动笔记
- `RecordingControls`：开始/停止按钮，录音状态指示
- `ManualNotes`：底部手动笔记输入区域（可选）

### Step 7: 整合测试
- 本地启动前后端
- 测试中文实时转录
- 测试中英混合场景
- 测试结构化笔记生成质量
- 调优 Claude prompt 以适配投研场景

---

## 投研场景专属 Prompt 设计

Claude 结构化笔记的 prompt 会针对投研访谈优化：

```
你是一名专业的投研助手，正在帮助研究员整理访谈纪要。
请根据以下转录内容，生成结构化的访谈笔记：

## 输出格式：
- **讨论主题**：本次访谈涉及的核心话题
- **关键信息**：重要的事实、数据、观点
- **财务数据**：提到的具体数字（营收、利润率、增长率等）
- **行业洞察**：对行业趋势的判断和看法
- **风险提示**：提到的风险因素或不确定性
- **待跟进问题**：需要进一步追问或验证的问题
```

---

## 你需要准备的 API Key

1. **Deepgram API Key**：注册 https://deepgram.com → 获取 API Key（有 $200 免费额度）
2. **Anthropic API Key**：注册 https://console.anthropic.com → 获取 API Key

这两个 Key 配置在 `.env` 文件中，不会提交到代码仓库。

---

## 开发顺序

我会按以下顺序实现：

1. ✅ 项目初始化 + 依赖安装
2. ✅ 后端 WebSocket 代理 + Deepgram 连接
3. ✅ 前端音频捕获 + 实时转录显示
4. ✅ Claude 结构化笔记集成
5. ✅ UI 打磨 + 投研场景优化
6. ✅ 整合测试

预计产出一个可以在本地运行的完整 Web 应用。
