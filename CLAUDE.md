# PointMaster 慧刷题 — 开发指南

## 项目概述

PointMaster 慧刷题是一款 AI 自适应知识掌握系统。核心理念：动态诊断 → 发现漏洞 → 快速学习 → 强化验证 → 真正掌握。

详细产品需求见：`docs/PRD/AI 自适应刷题学习系统 PRD（V1.0）.md`
前端设计原型见：`docs/design/index.html`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript 5 |
| 样式 | Tailwind CSS v3 + shadcn/ui |
| 数据库 | SQLite via better-sqlite3 + Drizzle ORM |
| 状态管理 | Zustand |
| 图谱可视化 | React Flow |
| 拖拽交互 | @dnd-kit/core |
| AI 接入 | OpenAI SDK（统一抽象，支持 OpenAI / DeepSeek / Qwen 切换） |
| 文件解析 | ExcelJS（Excel）+ PapaParse（CSV/TXT） |
| 数据验证 | Zod |

---

## 目录结构

```
pointmaster/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # 认证相关页面（未来扩展）
│   ├── api/                    # API Route Handlers
│   │   ├── banks/              # 题库管理 API
│   │   ├── questions/          # 题目 API
│   │   ├── sessions/           # 练习会话 API
│   │   ├── mastery/            # 掌握度 API
│   │   └── ai/                 # AI 相关 API（知识点提取、微学习生成等）
│   ├── banks/                  # 题库管理页面
│   │   ├── page.tsx            # 题库列表/上传
│   │   └── [id]/
│   │       └── page.tsx        # 题库详情 + 知识图谱
│   ├── practice/               # 练习相关页面
│   │   ├── [sessionId]/
│   │   │   ├── quiz/page.tsx   # 自适应做题页
│   │   │   ├── micro/page.tsx  # 微学习页
│   │   │   └── report/page.tsx # 掌握度报告页
│   ├── layout.tsx
│   └── page.tsx                # 首页（进行中的练习）
├── components/                 # 可复用组件
│   ├── ui/                     # shadcn/ui 生成的基础组件
│   ├── knowledge-graph/        # 知识图谱可视化组件
│   ├── micro-learning/         # 微学习画布组件
│   ├── quiz/                   # 做题相关组件
│   └── report/                 # 报告相关组件
├── lib/                        # 核心逻辑
│   ├── db/                     # 数据库
│   │   ├── schema.ts           # Drizzle schema 定义
│   │   ├── index.ts            # DB 连接实例
│   │   └── migrations/         # 迁移文件
│   ├── ai/                     # AI 服务抽象层
│   │   ├── client.ts           # LLM 客户端（统一接口）
│   │   ├── extract-points.ts   # 知识点提取
│   │   ├── build-graph.ts      # 知识图谱构建
│   │   └── generate-micro.ts   # 微学习内容生成
│   ├── algorithm/              # 自适应算法
│   │   ├── mastery.ts          # 掌握度/置信度更新算法
│   │   ├── question-selector.ts # 动态选题策略
│   │   └── recommender.ts      # 推荐系统
│   └── parsers/                # 文件解析
│       ├── excel.ts
│       ├── json.ts
│       └── txt.ts
├── types/                      # 全局 TypeScript 类型
├── docs/                       # 文档（PRD、设计稿等）
└── drizzle.config.ts           # Drizzle 配置
```

---

## 数据库 Schema（Drizzle ORM）

核心表（与 PRD 一致）：

- `question_banks`：题库
- `questions`：题目（含 difficulty、expected_time、question_type）
- `knowledge_points`：知识点（含 prerequisite_ids、micro_content JSON）
- `question_knowledge`：题目-知识点关联
- `user_mastery`：用户掌握度（mastery、confidence、tested_count）
- `learning_sessions`：学习会话
- `answer_records`：答题记录

数据库文件存放：`./data/pointmaster.db`（开发环境）

---

## 自适应算法核心

### 掌握度更新

```typescript
// 答对时
const timeFactor = clamp(1 - answerTime / expectedTime, 0, 1)
mastery += difficulty * 0.1 * (1 + timeFactor * 0.5)
confidence += 0.15

// 答错时
mastery -= difficulty * 0.12
confidence += 0.10

// 边界
mastery = clamp(mastery, 0, 1)
```

### 微学习触发条件

```typescript
confidence > 0.6 && mastery < 0.7
```

### 停止测试条件（满足任一）

- `confidence > 0.8`
- 连续答对 3 题
- 连续答错 2 题

---

## AI 服务配置

通过环境变量配置 LLM 提供商，代码层使用统一接口：

```env
LLM_PROVIDER=deepseek          # openai | deepseek | qwen
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

AI 职责：知识点提取与标注、知识图谱构建、微学习内容生成、划词提问响应、学习建议生成。

动态出题逻辑、掌握度/置信度计算、推荐决策均由系统算法完成，**不依赖 AI**。

---

## 设计规范

主题色：`#9fb997`（主绿）/ `#c8d4c0`（浅绿）
背景色：`#f4f2f0`
字体：Fraunces（标题）+ Plus Jakarta Sans（正文）

详见 `docs/design/index.html`（完整 HTML 原型）。

---

## 开发规范

### API Route 规范

- 使用 Next.js App Router 的 Route Handlers（`app/api/.../route.ts`）
- 所有 DB 操作在服务端执行（better-sqlite3 同步 API 适合 SSR，不适合无服务器部署）
- 请求/响应数据用 Zod schema 验证

### 组件规范

- 服务端组件默认，仅在需要交互/状态时加 `'use client'`
- shadcn/ui 组件放 `components/ui/`，不直接修改
- 业务组件放对应功能目录

### 状态管理

- 服务端数据通过 Server Component + fetch/db 直接获取
- 客户端全局状态（练习会话状态、当前掌握度等）用 Zustand
- 避免不必要的客户端状态提升

### 数据库迁移

```bash
npx drizzle-kit generate    # 生成迁移文件
npx drizzle-kit migrate     # 执行迁移
npx drizzle-kit studio      # 可视化查看数据
```

---

## 初始化命令

```bash
# 创建项目
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false

# 核心依赖
npm install drizzle-orm better-sqlite3 exceljs papaparse zod
npm install reactflow zustand @dnd-kit/core lodash-es date-fns
npm install openai

# 开发依赖
npm install -D @types/better-sqlite3 drizzle-kit

# 初始化 shadcn/ui
npx shadcn@latest init
```

---

## MVP 范围

**包含**：题库导入（Excel/JSON/TXT）、AI 知识点提取与树状分类、快速刷题模式、查缺补漏模式、自适应算法（含时间因子）、微学习（AI 生成卡片 + 划词提问）、掌握度报告

**不做**：AI 视频讲课、AI 生成整套题库、社区/排行榜、OCR 扫描、多端同步、知识图谱可视化界面（后台建图，前端暂不展示图谱）
