# 微学习功能设计文档

## 概述

微学习是 PointMaster 慧刷题的核心功能之一。当用户在某知识点上存在薄弱环节时，系统通过 AI 实时生成个性化的学习卡片，帮助用户快速理解和掌握知识点。

**核心特点**：
- 实时生成：每次进入都根据最新的答题情况个性化生成内容
- 完整输入：接收知识点 + 例题 + 答题记录 + 错误模式
- Canvas 画布：卡片可拖拽排列，SVG 连线展示知识关联
- 划词提问：选中文字即可向 AI 提问，生成延伸卡片
- 历史记录：保存每次微学习的卡片内容，可随时回顾

---

## 入口与触发方式

微学习作为**独立入口**，用户可从以下位置进入：
1. 知识图谱节点弹窗 → "进入微学习"按钮
2. 后续练习会话中自适应触发（预留接口，本次不实现 session 系统）

**路由**：`/micro-learning/[knowledgePointId]`

**URL Query Params**（可选）：
- `bankId`: 题库ID（用于获取例题）
- `sessionId`: 练习会话ID（用于获取答题记录和错误模式）

---

## API 接口设计

### 1. 生成微学习内容

**`POST /api/micro-learning/generate`**

输入：

```typescript
interface GenerateRequest {
  knowledgePointId: string
  context?: {
    // 该知识点下的例题
    questions: Array<{
      id: string
      content: string
      options: string[]
      answer: string
      analysis?: string
    }>
    // 用户答题记录
    answerRecords?: Array<{
      questionId: string
      userAnswer: string
      isCorrect: boolean
      answerTime: number  // 秒
    }>
    // 错误模式分析
    errorPatterns?: Array<{
      questionId: string
      questionContent: string
      wrongOption: string       // 用户选的错误答案
      correctOption: string     // 正确答案
    }>
  }
}
```

输出：

```typescript
interface GenerateResponse {
  cards: Array<{
    id: string
    type: "concept" | "signal" | "template" | "pitfall" | "example"
    title: string
    content: string       // markdown 格式
    importance: "required" | "recommended"
  }>
  connections: Array<{
    from: string  // card id
    to: string    // card id
    label: string
  }>
}
```

### 2. 划词提问

**`POST /api/micro-learning/ask`**

输入：

```typescript
interface AskRequest {
  knowledgePointId: string
  selectedText: string
  sourceCardId: string
  sourceCardContent: string  // 来源卡片的内容，提供上下文
}
```

输出：

```typescript
interface AskResponse {
  card: {
    id: string
    type: "extended"
    title: string
    content: string         // markdown 格式
    sourceKeyword: string   // 来源关键词
  }
  connection: {
    from: string  // sourceCardId
    to: string    // new card id
    label: string
  }
}
```

### 3. 历史记录

**`GET /api/micro-learning/history?knowledgePointId=xxx`**

返回该知识点的微学习历史列表（时间倒序）：

```typescript
interface HistoryListResponse {
  records: Array<{
    id: string
    knowledgePointId: string
    knowledgePointName: string
    cardCount: number
    extendedCardCount: number
    createdAt: number
  }>
}
```

**`GET /api/micro-learning/history/[id]`**

获取某次历史记录的完整内容：

```typescript
interface HistoryDetailResponse {
  id: string
  knowledgePointId: string
  cards: GenerateResponse["cards"]
  extendedCards: AskResponse["card"][]
  connections: GenerateResponse["connections"]
  context: GenerateRequest["context"]  // 当时的输入快照
  createdAt: number
}
```

---

## AI Prompt 设计

### 微学习内容生成

AI 输出使用 **markdown 结构**，后端按 `## 标题` 分段解析为卡片。

**System Prompt**：

```
你是一位教学设计专家，擅长将知识点拆解为易于理解的微学习卡片。

要求：
- 语言精炼，避免冗余
- 使用 **加粗** 标记关键术语
- 数学公式使用行内文本表达
- 每张卡片内容控制在 100-200 字
```

**User Prompt 模板**：

```
请为以下知识点生成微学习卡片：

### 知识点
名称：{name}
描述：{description}

### 该知识点的例题
{questions_list}

### 用户答题情况
{answer_records_summary}

### 用户错误模式
{error_patterns_detail}

请按以下格式生成5类卡片：

## 核心概念
（用最精炼的语言解释核心定义和结论，标记关键术语）

## 识别信号
（列出3-5个"看到__就想到__"的触发信号）

## 解题模板
（给出标准化的解题步骤框架，用编号标注每一步）

## 易错点
（基于用户错误模式指出高频错误，提供反例。若无用户数据则给出通用易错点）

## 例题
（选取1-2道代表性题目，给出完整解题过程）
```

### 划词提问

**Prompt 模板**：

```
用户在学习「{knowledgePointName}」时，对以下内容中的「{selectedText}」提出了疑问。

来源卡片内容：
{sourceCardContent}

请用简洁清晰的语言解释「{selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如果涉及数学概念，给出简单例子
- 控制在 150 字以内
```

### 后端解析逻辑

```typescript
// 按 ## 标题分段
const sections = aiOutput.split(/^## /m).filter(Boolean)

// 每段提取标题和内容
sections.map(section => {
  const [titleLine, ...contentLines] = section.split('\n')
  return {
    title: titleLine.trim(),
    content: contentLines.join('\n').trim()
  }
})
```

容错：如果某类卡片缺失则跳过（不报错），如果 AI 输出额外内容则忽略。

---

## 数据库设计

新增一张表用于保存微学习历史记录：

```typescript
// lib/db/schema.ts 新增

export const microLearningRecords = sqliteTable('micro_learning_records', {
  id: text('id').primaryKey(),
  knowledgePointId: text('knowledge_point_id').notNull(),
  bankId: text('bank_id').notNull(),
  generatedCards: text('generated_cards').notNull(),    // JSON: cards + connections
  extendedCards: text('extended_cards'),                 // JSON: 划词提问生成的卡片
  context: text('context'),                             // JSON: 输入快照（题目+答题记录+错误模式）
  createdAt: integer('created_at').notNull(),
})
```

---

## 前端设计

### 页面结构

```
app/micro-learning/[knowledgePointId]/page.tsx
```

页面布局（参照 docs/design/index.html Page 5）：

```
┌──────────────────────────────────────────────────┐
│ Toolbar: [知识点名称] [卡片进度] [历史] [完成学习] │
├──────────────────────────────────────────────────┤
│                                                    │
│            Canvas Viewport                         │
│   ┌─────┐         ┌─────┐                        │
│   │概念卡│────────→│易错点│                        │
│   └─────┘         └─────┘                        │
│       │               │                           │
│       ▼               ▼                           │
│   ┌─────┐         ┌─────┐     ┌──────┐          │
│   │模板卡│────────→│例题卡│     │延伸卡片│          │
│   └─────┘         └─────┘     └──────┘          │
│                                                    │
│                           [+] [100%] [-]  (zoom)  │
└──────────────────────────────────────────────────┘
```

### 组件拆分

```
components/micro-learning/
├── micro-learning-canvas.tsx    # 主画布（viewport + world + pan/zoom）
├── learning-card.tsx            # 单张卡片（拖拽 + 内容渲染）
├── card-connections.tsx         # SVG 连线层
├── selection-popup.tsx          # 划词提问弹出按钮
├── loading-skeleton.tsx         # 加载骨架屏（AI生成中）
├── toolbar.tsx                  # 顶部工具栏
└── history-drawer.tsx           # 历史记录侧边抽屉
```

### 交互说明

1. **加载状态**：进入页面后显示骨架屏，API调用AI生成卡片内容（3-8秒），完成后渲染
2. **卡片拖拽**：通过卡片头部拖拽，使用 pointer events 实现
3. **画布平移**：在空白区域按住拖拽
4. **画布缩放**：滚轮或右下角 +/- 按钮，范围 30%-200%
5. **划词提问**：在卡片正文中选中文字 → 弹出"提问"按钮 → 点击后调用API → 新卡片追加到画布右侧
6. **自动布局**：卡片初始位置通过简单的网格布局计算（概念类在左，易错+例题在右，延伸在下方）
7. **历史记录**：toolbar上的"历史"按钮打开 Drawer，展示历史列表，点击可加载历史卡片
8. **完成学习**：点击"完成学习"按钮，保存当前卡片到历史记录，导航返回

### 卡片视觉

| 类型 | 头部颜色点 | 标签文字 | 边框 |
|------|-----------|----------|------|
| concept | `#6b8c64` | 核心概念 | 实线 |
| signal | `#5a8ab8` | 识别信号 | 实线 |
| template | `#5a8ab8` | 解题模板 | 实线 |
| pitfall | `#b85858` | ⚠️ 易错点 | 实线 |
| example | `#6a8c60` | 典型例题 | 实线 |
| extended | `#b89040` | 延伸卡片 | 虚线 |

### 连线风格

- 基础卡片间：实线 + 箭头 + 标签（如"对比说明"、"模板应用"）
- 延伸卡片连线：虚线 + 箭头 + "提问延伸"标签
- 颜色跟随目标卡片类型

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `app/micro-learning/[knowledgePointId]/page.tsx` | 微学习页面 |
| `app/api/micro-learning/generate/route.ts` | AI生成卡片API |
| `app/api/micro-learning/ask/route.ts` | 划词提问API |
| `app/api/micro-learning/history/route.ts` | 历史列表API |
| `app/api/micro-learning/history/[id]/route.ts` | 历史详情API |
| `lib/ai/generate-micro.ts` | 微学习AI生成逻辑 |
| `lib/ai/ask-question.ts` | 划词提问AI逻辑 |
| `components/micro-learning/micro-learning-canvas.tsx` | 主画布组件 |
| `components/micro-learning/learning-card.tsx` | 卡片组件 |
| `components/micro-learning/card-connections.tsx` | SVG连线 |
| `components/micro-learning/selection-popup.tsx` | 划词提问弹出 |
| `components/micro-learning/loading-skeleton.tsx` | 加载骨架屏 |
| `components/micro-learning/toolbar.tsx` | 工具栏 |
| `components/micro-learning/history-drawer.tsx` | 历史记录抽屉 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/db/schema.ts` | 新增 `micro_learning_records` 表 |
| `components/knowledge-graph/graph-view.tsx` | 节点弹窗增加"进入微学习"链接 |

---

## 边界与约束

1. **本次不实现**：练习会话系统（session）、自适应触发逻辑、掌握度算法。微学习作为独立功能存在。
2. **输入来源**：知识点和例题从数据库获取；答题记录和错误模式通过 URL params 中的 sessionId 获取（如有），或者由调用方直接传入 API body。
3. **AI 容错**：如果 AI 输出不完整（缺少某类卡片），跳过该卡片不报错；如果 AI 调用失败，前端展示错误提示并提供重试按钮。
4. **性能**：AI 生成预计 3-8 秒，用骨架屏过渡。划词提问预计 2-4 秒，用 loading spinner 过渡。
5. **历史记录**：每次"完成学习"时自动保存。不限制保存数量。
