# 导入题库 → AI 知识点提取 → 知识图谱生成 设计文档

**日期**：2026-05-28  
**范围**：从零搭建项目，实现完整的题库导入链路（含前端 UI）  
**状态**：已确认

---

## 1. 概述

实现 PointMaster 慧刷题的第一条核心链路：

```
用户上传题库文件
  → 系统解析文件提取题目
  → 后台异步逐题调用 AI（DeepSeek）提取知识点/难度/题型
  → AI 分析所有知识点构建依赖图谱
  → 前端展示知识图谱可视化
```

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript 5 |
| 样式 | Tailwind CSS v3 + shadcn/ui |
| 数据库 | SQLite via better-sqlite3 + Drizzle ORM |
| 图谱可视化 | React Flow + @dagrejs/dagre（自动布局） |
| AI 接入 | OpenAI SDK（指向 DeepSeek API） |
| 文件解析 | ExcelJS（Excel）+ 内置 JSON.parse + 自定义 TXT 解析 |
| 数据验证 | Zod |

---

## 3. 数据库 Schema

### 3.1 question_banks

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (UUID) | 主键 |
| name | text | 题库名称 |
| description | text, nullable | 描述 |
| file_name | text | 原始上传文件名 |
| total_questions | integer | 题目总数 |
| status | text | pending / extracting / building_graph / completed / failed |
| progress | integer | 处理进度 0-100 |
| progress_message | text, nullable | 进度描述文字 |
| created_at | integer | Unix timestamp |
| updated_at | integer | Unix timestamp |

### 3.2 questions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (UUID) | 主键 |
| bank_id | text | FK → question_banks |
| content | text | 题干 |
| options | text (JSON) | 选项数组 ["A...", "B...", ...] |
| answer | text | 正确答案 |
| analysis | text, nullable | 解析 |
| difficulty | real, nullable | AI 标注难度 0~1 |
| question_type | text, nullable | AI 标注题型 |
| expected_time | integer, nullable | 预期作答时间(秒) |
| ai_extracted | integer (0/1) | 是否已完成 AI 提取 |
| ai_knowledge_points | text (JSON), nullable | AI 提取的知识点名称数组（临时存储） |
| created_at | integer | Unix timestamp |

### 3.3 knowledge_points

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (UUID) | 主键 |
| bank_id | text | FK → question_banks |
| name | text | 知识点名称 |
| description | text, nullable | 描述 |
| prerequisite_ids | text (JSON) | 前置知识点 ID 数组 |
| micro_content | text (JSON), nullable | 微学习内容（后续填充） |
| created_at | integer | Unix timestamp |

### 3.4 question_knowledge

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (UUID) | 主键 |
| question_id | text | FK → questions |
| knowledge_point_id | text | FK → knowledge_points |
| is_primary | integer (0/1) | 是否为主要知识点 |

---

## 4. 处理流程

### 4.1 整体架构（两阶段串行）

```
POST /api/banks (上传文件)
  → 文件保存到 ./data/uploads/
  → 解析文件提取题目 → 写入 questions 表
  → 创建 bank 记录 (status = pending)
  → 返回 bank_id

POST /api/banks/[id]/process (触发处理)
  → 启动异步处理（Node.js 内 async function，非阻塞）
  → 立即返回 202 Accepted

异步处理:
  阶段1 (status = extracting):
    for each question (ai_extracted = 0):
      → 调用 DeepSeek 提取知识点/难度/题型
      → 更新 question 记录
      → 更新 bank progress
  
  阶段2 (status = building_graph):
    → 收集所有去重知识点名称
    → 调用 DeepSeek 构建知识图谱（依赖关系）
    → 写入 knowledge_points 表
    → 写入 question_knowledge 关联表
    → 更新 bank status = completed
```

### 4.2 异步机制

- 不引入外部队列（BullMQ/Redis），使用进程内异步
- `POST /api/banks/[id]/process` 中启动 async 函数，不 await，立即返回
- 进度通过 `question_banks.progress` 和 `question_banks.progress_message` 追踪
- 前端每 2 秒轮询 `GET /api/banks/[id]/status`
- 错误处理：捕获异常 → 更新 status = failed + progress_message 写入错误信息

### 4.3 容错

- 单题 AI 提取失败：跳过，记录到 progress_message，不阻塞后续
- 图谱构建失败：status = failed，前端可重试
- AI 返回格式不正确：Zod 校验，失败则重试一次（同一题最多重试 1 次）

---

## 5. AI Prompt 设计

### 5.1 知识点提取 Prompt

```
系统消息:
你是一个教育领域的知识点标注专家。请根据给定的题目信息，提取该题涉及的知识点并评估难度。

用户消息:
学科领域：{bank_name}

题目：{content}
选项：{options}
答案：{answer}
解析：{analysis}

请以 JSON 格式返回：
{
  "knowledge_points": ["知识点1", "知识点2"],  // 2-6字的简洁名称，1-3个
  "difficulty": 0.65,                           // 0-1之间
  "question_type": "单选题",                    // 单选题/多选题/判断题/填空题/计算题
  "expected_time": 30                           // 预期作答时间(秒)
}

要求：
- 知识点名称要简洁可复用（如"导数"、"极值"、"定积分"），不要写描述性文字
- difficulty 根据题目计算复杂度和概念深度综合评估
- expected_time 根据难度估算，简单题15-20秒，中等题25-40秒，难题45-90秒
- 只返回 JSON，不要其他文字
```

### 5.2 知识图谱构建 Prompt

```
系统消息:
你是一个教育领域的知识体系专家。请根据给定的知识点列表，分析它们之间的学习依赖关系，构建知识图谱。

用户消息:
学科领域：{bank_name}
知识点列表（含关联题目数）：
- 极限 (28题)
- 导数 (46题)
- 积分 (52题)
- 连续性 (18题)
...

请以 JSON 格式返回知识图谱：
{
  "knowledge_points": [
    {
      "name": "极限",
      "description": "描述函数在某点附近的趋近行为，是导数和积分的基础概念。",
      "prerequisites": []
    },
    {
      "name": "导数",
      "description": "函数在某点处的瞬时变化率，几何意义为切线斜率。",
      "prerequisites": ["极限"]
    }
  ]
}

要求：
- prerequisites 只填直接依赖的知识点名称（必须是列表中存在的名称）
- 构建有向无环图（DAG），不能出现循环依赖
- 基础知识点 prerequisites 为空
- description 用一句话概括该知识点的核心含义
- 只返回 JSON，不要其他文字
```

---

## 6. 文件解析器

### 6.1 Excel 解析器

期望列结构（第一行为表头）：

| 题目 | A | B | C | D | 答案 | 解析 |

也支持变体表头：`题干`/`question`/`内容` → content，`选项A`/`A选项` → A

解析逻辑：
1. 读取第一个 Sheet
2. 识别表头行（匹配关键词）
3. 逐行提取，跳过空行
4. 组装 `{ content, options: [A, B, C, D], answer, analysis }` 数组

### 6.2 JSON 解析器

期望格式：
```json
[
  {
    "content": "题干...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "answer": "B",
    "analysis": "解析..."
  }
]
```

也支持 `question`/`题目` 作为 content 的别名。

### 6.3 TXT 解析器

期望格式（题目之间用空行分隔）：
```
1. 题干内容
A. 选项A
B. 选项B
C. 选项C
D. 选项D
答案：B
解析：解析内容

2. 下一题题干...
```

---

## 7. 前端页面设计

### 7.1 全局布局

- 固定侧边栏（232px）+ 主内容区
- 侧边栏参照设计稿：Logo + 导航列表 + 底部用户信息
- 本阶段只有「首页」和「题库管理」可点击，其余导航项灰显
- 设计色：主绿 #9fb997，浅绿 #c8d4c0，背景 #f4f2f0
- 字体：Fraunces（标题）+ Plus Jakarta Sans（正文）

### 7.2 题库管理页 (`/banks`)

参照设计稿 page-banks：
- 上传区域：虚线边框 + 上传图标 + 说明文字 + 选择文件按钮
- 题库卡片网格（grid，auto-fill，minmax 270px）
- 卡片内容：图标、名称、元信息（题数/知识点数/导入日期）、状态 chip、操作按钮
- 状态映射：
  - `pending` → "等待处理" chip
  - `extracting` → "AI 解析中..." + 进度条
  - `building_graph` → "构建图谱中..." + 进度条
  - `completed` → "已完成" 绿色 chip
  - `failed` → "处理失败" 红色 chip + 重试按钮

### 7.3 题库详情页 (`/banks/[id]`)

参照设计稿 page-bankdetail：
- 面包屑导航
- 题库信息头部（名称 + info chips + 开始练习按钮）
- 统计卡片网格（2x2）：题目总数、知识点总数、解析进度、依赖关系数
- 知识图谱可视化区域（核心）
- 图谱下方提示文字

**处理中状态**：如果 status 不是 completed，统计卡片区域显示处理进度，图谱区域显示加载状态。

### 7.4 知识图谱可视化

使用 React Flow + dagre 自动布局：

**数据转换**：
```typescript
// API 返回 → React Flow 格式
const nodes: Node[] = knowledgePoints.map(kp => ({
  id: kp.id,
  type: 'knowledgeNode',  // 自定义节点
  data: { name: kp.name, questionCount, isRoot: kp.prerequisiteIds.length === 0 },
  position: { x: 0, y: 0 }  // dagre 计算
}))

const edges: Edge[] = knowledgePoints.flatMap(kp =>
  kp.prerequisiteIds.map(preId => ({
    id: `${preId}-${kp.id}`,
    source: preId,
    target: kp.id,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed }
  }))
)
```

**dagre 布局**：
- 方向：TB（上到下）
- nodeWidth: 150, nodeHeight: 40
- rankSep: 80, nodeSep: 60

**自定义节点样式**：
- 根节点：深绿底色 (#6b8c64) + 白色文字
- 普通节点：白底 + 绿色边框 (#9fb997) + 圆角胶囊形
- hover：放大 + 阴影

**交互**：
- 点击节点：弹出 popup 显示知识点详情（描述、关联题数、前置知识点、典型例题）
- 支持缩放和拖拽

### 7.5 节点 Popup

参照设计稿 node-popup-backdrop：
- 居中模态弹窗 (520px 宽)
- 内容：知识点名称、描述、题数 chip、前置知识点 chip、典型例题列表
- 按钮：关闭 / 进入微学习（后续功能，暂不可用）

---

## 8. API 路由

| 方法 | 路径 | 功能 | 请求 | 响应 |
|------|------|------|------|------|
| GET | `/api/banks` | 获取所有题库 | - | Bank[] |
| POST | `/api/banks` | 上传文件创建题库 | FormData (file, name) | { id, status } |
| GET | `/api/banks/[id]` | 获取题库详情 | - | Bank + stats |
| DELETE | `/api/banks/[id]` | 删除题库 | - | { success } |
| POST | `/api/banks/[id]/process` | 触发 AI 处理 | - | { status: 'started' } |
| GET | `/api/banks/[id]/status` | 获取处理进度 | - | { status, progress, message } |
| GET | `/api/banks/[id]/graph` | 获取知识图谱 | - | { nodes, edges } |

---

## 9. 目录结构

```
pointmaster/
├── app/
│   ├── layout.tsx                    -- 全局布局（侧边栏）
│   ├── page.tsx                      -- 首页（重定向到 /banks）
│   ├── banks/
│   │   ├── page.tsx                  -- 题库列表页
│   │   └── [id]/
│   │       └── page.tsx              -- 题库详情页
│   └── api/
│       └── banks/
│           ├── route.ts              -- GET 列表 / POST 创建
│           └── [id]/
│               ├── route.ts          -- GET 详情 / DELETE 删除
│               ├── process/route.ts  -- POST 触发处理
│               ├── status/route.ts   -- GET 进度
│               └── graph/route.ts    -- GET 图谱数据
├── components/
│   ├── ui/                           -- shadcn/ui 组件
│   ├── layout/
│   │   └── sidebar.tsx               -- 侧边栏
│   ├── banks/
│   │   ├── upload-strip.tsx          -- 上传区域
│   │   ├── bank-card.tsx             -- 题库卡片
│   │   └── bank-status.tsx           -- 状态/进度组件
│   └── knowledge-graph/
│       ├── graph-view.tsx            -- React Flow 图谱容器
│       ├── knowledge-node.tsx        -- 自定义节点
│       └── node-popup.tsx            -- 节点详情弹窗
├── lib/
│   ├── db/
│   │   ├── index.ts                  -- DB 连接
│   │   ├── schema.ts                 -- Drizzle schema
│   │   └── migrations/
│   ├── ai/
│   │   ├── client.ts                 -- DeepSeek 客户端
│   │   ├── extract-points.ts         -- 知识点提取逻辑
│   │   └── build-graph.ts            -- 知识图谱构建逻辑
│   ├── parsers/
│   │   ├── index.ts                  -- 解析器入口（根据格式分发）
│   │   ├── excel.ts                  -- Excel 解析
│   │   ├── json.ts                   -- JSON 解析
│   │   └── txt.ts                    -- TXT 解析
│   └── process/
│       └── bank-processor.ts         -- 异步处理编排逻辑
├── types/
│   └── index.ts                      -- 全局类型
├── data/                             -- 运行时数据（gitignore）
│   ├── uploads/                      -- 上传文件存放
│   └── pointmaster.db                -- SQLite 数据库
├── drizzle.config.ts
├── .env.local                        -- 环境变量
└── package.json
```

---

## 10. 环境变量

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

---

## 11. 不在本次范围

- 用户认证系统
- 练习模式（快速刷题 / 查缺补漏）
- 自适应刷题算法
- 微学习系统
- 掌握度报告
- 多用户支持（本阶段单用户）
