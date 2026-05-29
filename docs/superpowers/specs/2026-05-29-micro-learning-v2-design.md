# 微学习 V2 设计文档

> 本文件**取代** `2026-05-28-micro-learning-design.md`（V1）。开发环境无需保留旧表数据，直接重建 schema。

## 概述

把微学习重构为**独立实体**：

- 内容形态从「5 类卡片（概念/信号/模板/易错/例题）」简化为「**知识点详细解读与教学** + **例题分析（2-3 道真题）**」。
- 与题库的关系：微学习不再绑死在题库上下文中，而是**独立资源**——一个题库下可以有多条微学习记录（不同知识点、同知识点多次、来自不同 session 触发或手动触发）。
- 与练习 session 的关系：微学习记录可选关联到 session（PRD V2.0 中 Agent 触发的场景），也可不关联（用户从知识点手动触发）。
- 划词提问保留，产生「延伸卡」附加到画布。

---

## 实体模型

### 数据库 Schema

新增表 `micro_learnings`（**drop 旧 `micro_learning_records` 后重建**）：

```typescript
// lib/db/schema.ts
export const microLearnings = sqliteTable("micro_learnings", {
  id: text("id").primaryKey(),
  knowledgePointId: text("knowledge_point_id").notNull(),
  bankId: text("bank_id").notNull(),                // 反推冗余，便于 listByBank
  sessionId: text("session_id"),                    // 可空：null=KP 手动触发；有值=session-Agent 触发
  focusHint: text("focus_hint"),                    // Agent 触发时的薄弱表现描述
  detailedExplanation: text("detailed_explanation").notNull(),  // Markdown
  exampleAnalyses: text("example_analyses").notNull(),          // JSON: ExampleAnalysis[]
  extendedCards: text("extended_cards"),                        // JSON: ExtendedCard[]，可空
  sourceQuestionIds: text("source_question_ids"),               // JSON: string[]，例题 id 快照
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})
```

**归属链**：`micro_learning → knowledge_point → bank`，`bank_id` 通过反推 KP 得到，冗余存储以便按题库查询。

**生命周期**：
- 创建：API POST 时一次性写入（详解 + 例题分析 + 例题快照）
- 更新：仅 `extended_cards` 与 `updated_at`（划词追问），或 `example_analyses` 中某项重试时
- 删除：本次不实现

### 类型定义

```typescript
// types/micro-learning.ts

export type CardType = "detail" | "example" | "extended"

export interface ExampleAnalysis {
  questionId: string
  content: string                    // 题面
  options: string[]                  // 选项
  answer: string                     // 标准答案
  userAnswer?: string                // 用户作答（来自 session 错题）
  isWrong?: boolean                  // 是否错题（仅 session 触发时有意义）
  analysis: string                   // AI 生成的解题分析（Markdown）
}

export interface ExtendedCard {
  id: string
  type: "extended"
  title: string                      // 「什么是XX？」
  content: string                    // Markdown 解答（≤150 字）
  sourceCardId: string               // 来源卡 ID（detail-{recordId} 或 example-{questionId}）
  sourceKeyword: string              // 选中的文字
  createdAt: number
}

export interface MicroLearningRecord {
  id: string
  knowledgePointId: string
  knowledgePointName: string         // join 出来便于前端显示
  bankId: string
  sessionId: string | null
  focusHint: string | null
  detailedExplanation: string
  exampleAnalyses: ExampleAnalysis[]
  extendedCards: ExtendedCard[]
  sourceQuestionIds: string[]
  createdAt: number
  updatedAt: number
}

export interface MicroLearningListItem {
  id: string
  knowledgePointId: string
  knowledgePointName: string
  sessionId: string | null
  exampleCount: number
  extendedCardCount: number
  createdAt: number
}

// 画布渲染时使用的统一卡片视图（前端用）
export interface MicroCard {
  id: string                         // detail-{recordId} | example-{questionId} | uuid (extended)
  type: CardType
  title: string
  content: string                    // Markdown 主体
  // example 专属
  questionId?: string
  questionMeta?: {
    options: string[]
    answer: string
    userAnswer?: string
    isWrong?: boolean
  }
  // extended 专属
  sourceCardId?: string
  sourceKeyword?: string
}
```

---

## 入口与触发场景

| 入口 | 路由 | sessionId | focusHint | 例题策略 |
|------|------|-----------|-----------|---------|
| **题库 / 知识图谱节点弹窗** | `/micro-learning/new?kpId=X&bankId=Y` | null | null | 该 KP 题库题目随机抽 2-3 道 |
| **练习 Agent 建议** | `/micro-learning/new?kpId=X&bankId=Y&sessionId=Z&focusHint=...` | 有值 | Agent 给出 | 本次 session 该 KP 错题优先（最多 2）+ 不足从题库随机补到 3 道 |
| **题库详情页·重新学习** | 同手动入口 | null | null | 同手动入口 |
| **题库详情页·查看记录** | `/micro-learning/[id]` | — | — | 不重新生成，读现成 |

### 入口 1：知识图谱节点

`components/knowledge-graph/node-popup.tsx` 当前的 disabled 「进入微学习」按钮启用为：

```tsx
<Link href={`/micro-learning/new?kpId=${node.id}&bankId=${bankId}`}>
  进入微学习 →
</Link>
```

### 入口 2：Session-Agent 触发（PRD V2.0）

实现方式：
- session 引擎在 Agent 返回 `action=micro_learning` 时，调 POST `/api/micro-learning` 携带 `knowledgePointId / sessionId / focusHint` → 拿到 `id`
- 创建 `step_type=micro_learning` 的 step 并记 `microLearningId` 到 step.data
- 前端跳转 `/micro-learning/[id]?returnTo=/practice/[sessionId]`
- 用户在工具栏点「学完了，继续练习」→ 走 returnTo 导航回 session

**本次范围**：实现 API 契约 + returnTo 跳转能力。session 端的引擎对接在 practice-flow 模块完成（已在 practice-flow spec 中 stub）。

### 入口 3：题库详情页·微学习记录列表

题库详情页新增折叠面板（或 Tab）「本题库的微学习记录」：
- GET `/api/micro-learning?bankId=X` 返回该题库所有记录（按 `createdAt` 倒序）
- 每行：知识点名 / 来源标签（「Session: {sessionName}」or「手动」）/ 例题数 / 延伸卡数 / 创建时间
- 行内按钮「查看」→ `/micro-learning/[id]`（只读 + 继续追问能力）
- 行尾按钮「重新学习」→ 走入口 1 流程

---

## API 设计

5 个 endpoint：

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/micro-learning` | POST | 创建（生成详解 + 例题分析，落库后返回完整记录） |
| `/api/micro-learning?bankId=X` | GET | 列出某题库下所有记录 |
| `/api/micro-learning/[id]` | GET | 单条详情（含 extendedCards） |
| `/api/micro-learning/[id]/ask` | POST | 划词提问，追加延伸卡 |
| `/api/micro-learning/[id]/retry-example` | POST | 单道例题分析重试 |

### POST `/api/micro-learning`

**请求体**：
```typescript
{
  knowledgePointId: string
  sessionId?: string
  focusHint?: string
}
```

**后端流程**：
1. 校验 KP 存在 → 反推 `bankId`
2. 选例题：
   - 有 `sessionId`：从 `answer_records` 取该 session 内该 KP 的错题（最多 2 道，按 `answerTime` 倒序），不足 3 道时从该 KP 题库题目随机补
   - 无 `sessionId`：该 KP 题库题目随机抽 2-3 道
3. 调 `generateMicroLearning`（见 AI 章节）
4. 生成 uuid，写入 `micro_learnings` 表（`createdAt = updatedAt = Date.now()`）
5. 返回 `MicroLearningRecord`

**响应**：完整 `MicroLearningRecord`

### GET `/api/micro-learning?bankId=X`

返回 `{ records: MicroLearningListItem[] }`，按 `createdAt` 倒序。

### GET `/api/micro-learning/[id]`

返回完整 `MicroLearningRecord`。404 当 id 不存在。

### POST `/api/micro-learning/[id]/ask`

**请求体**：
```typescript
{
  selectedText: string         // ≤30 字
  sourceCardId: string         // detail-{recordId} | example-{questionId}
  sourceCardContent: string    // 来源卡片正文，提供上下文
}
```

**后端流程**：
1. 读取记录（拿到 `knowledgePointName` + 现有 `extendedCards`）
2. 调 `askAboutSelection`（见 AI 章节）
3. 构造 `ExtendedCard`：`{ id: uuid, type: "extended", title: "什么是${selectedText}？", content, sourceCardId, sourceKeyword: selectedText, createdAt: Date.now() }`
4. append 到 `extended_cards` JSON 数组，更新 `updated_at`
5. 返回新增的 `ExtendedCard`

### POST `/api/micro-learning/[id]/retry-example`

**请求体**：`{ questionId: string }`

**后端流程**：
1. 读取记录，定位 `exampleAnalyses` 中对应项
2. 调 AI 仅生成该题的 analysis（复用 `generate-micro` 的子函数）
3. 替换该项的 `analysis`，更新 `updated_at`
4. 返回新的 `ExampleAnalysis`

---

## AI 生成

### 生成详解 + 例题分析（一次调用）

`lib/ai/generate-micro.ts` 重写。**JSON Mode** 输出，避免 Markdown 解析。

**System Prompt**：
```
你是一位教学设计专家，针对「{knowledge_point_name}」给学生做一对一辅导。
输出严格遵循 JSON 格式，不要包裹 markdown 代码块。
```

**User Prompt 模板**：
```
请为知识点「{name}」生成微学习内容。

### 知识点描述
{description or "无"}

### 用户薄弱表现（来自 Agent 提示）
{focusHint or "用户希望系统学习此知识点"}

### 例题与用户作答情况
题目1（id: q_001）：{content}
选项：A. xx  B. yy  C. zz  D. ww
标准答案：B
用户作答：D（答错）

题目2（id: q_002）：...
（无 session 时省略「用户作答」字段）

### 输出格式（JSON）
{
  "detailed_explanation": "...",     // Markdown，按子标题组织：定义、原理、适用场景、常见误区、学习建议；500-1000 字
  "example_analyses": [
    {
      "questionId": "q_001",         // 必须与输入题目 id 严格对应
      "analysis": "..."              // Markdown：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源；200-400 字
    },
    ...
  ]
}
```

**容错策略**：
- JSON parse 失败 → 整体重试 1 次，仍失败返回 503，前端展示「生成失败，重新生成」按钮
- `example_analyses` 数组缺项 → 按 `questionId` 对齐，缺失的例题保留题面但 `analysis` 留空，前端单卡显示「AI 分析缺失，点击重试」（走 `retry-example` 接口）

**Token 预算**：详解 ~500 token + 每题分析 ~250 token × 3 ≈ 1300 token 输出，预计 6-12 秒延迟。前端用骨架屏过渡。

### 划词提问（延伸卡）

`lib/ai/ask-question.ts` 沿用，做轻微调整：

```
用户在学习「{knowledgePointName}」时，对以下内容中的「{selectedText}」提出了疑问。

来源卡片内容：
{sourceCardContent}

请用简洁清晰的语言解释「{selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如有数学概念给出简单例子
- 控制在 150 字以内
```

输出纯 Markdown 文本，前端构造为 `ExtendedCard`。

---

## 前端设计

### 路由

| 路径 | 用途 |
|------|------|
| `/micro-learning/new?kpId=X&bankId=Y[&sessionId=Z&focusHint=...&returnTo=/...]` | 创建中转页：客户端立即 POST 创建，拿到 id 后 `router.replace` 到 `/micro-learning/[id]` |
| `/micro-learning/[id]?returnTo=/...` | 详情页（创建后 / 列表点击 / 查看历史 都到这里） |

`returnTo` 仅 URL 透传，工具栏「完成学习」/「学完了，继续练习」按钮使用：有则跳 returnTo，无则跳回 `/banks/{bankId}`。

### 页面结构

`app/micro-learning/[id]/page.tsx` 加载流程：
1. 客户端 `use(params)` 拿到 `id`
2. `useEffect` GET `/api/micro-learning/[id]` → 设置 cards/extendedCards/recordMeta
3. 渲染 Toolbar + Canvas

`app/micro-learning/new/page.tsx`：
1. `use(searchParams)` 拿到 kpId / sessionId / focusHint / bankId / returnTo
2. POST `/api/micro-learning` 同步创建
3. 拿到 record.id 后 `router.replace(/micro-learning/${id}${returnTo ? '?returnTo='+returnTo : ''})`
4. 期间显示骨架屏（创建本身 6-12 秒）

### 卡片视觉

| 类型 | 卡 ID | 头部点 | 标签 | 边框 | 宽度 |
|------|------|--------|------|------|------|
| `detail` | `detail-{recordId}` | `bg-primary-dark` (#6b8c64) | 知识点详解 | 实线 | 320px |
| `example` | `example-{questionId}` | `bg-[#5a8ab8]` (蓝) | 例题分析 | 实线（错题加 1px 红色右边线） | 280px |
| `extended` | uuid | `bg-[#b89040]` (橙) | 延伸 | 虚线 | 280px |

**Detail 卡正文**：渲染 `detailedExplanation`（已是 Markdown，复用现有的 markdown 渲染器或简单 sanitize）。

**Example 卡正文**：
```
{content}
─────────
A. xx    B. yy    C. zz    D. ww
─────────
✓ 标准答案：B
✗ 你的作答：D（错题徽章）
─────────
{analysis Markdown}
```

**Extended 卡正文**：渲染 `content`，头部小字显示「来自「{sourceKeyword}」」。

### 画布初始布局

```typescript
// components/micro-learning/micro-learning-canvas.tsx 中的 layout 算法
const DETAIL_X = 60, DETAIL_Y = 40
const EXAMPLE_X = DETAIL_X + 320 + 100   // 详解卡右侧 100px gap
const EXAMPLE_Y_GAP = 60
const CARD_HEIGHT_DEFAULT = 220          // 例题卡估高，实际可由内容撑开

// detail 卡固定位置
positions.push({ id: detailId, x: DETAIL_X, y: DETAIL_Y, width: 320 })

// example 卡：错题在前，正确在后
const sortedExamples = [...examples].sort((a,b) => Number(b.isWrong) - Number(a.isWrong))
sortedExamples.forEach((ex, i) => {
  positions.push({
    id: `example-${ex.questionId}`,
    x: EXAMPLE_X,
    y: DETAIL_Y + i * (CARD_HEIGHT_DEFAULT + EXAMPLE_Y_GAP),
    width: 280,
  })
})

// extended 卡：附加在画布最右侧，按创建顺序纵向排列
const EXT_X = EXAMPLE_X + 280 + 100
extendedCards.forEach((ext, i) => {
  positions.push({
    id: ext.id,
    x: EXT_X,
    y: DETAIL_Y + i * (CARD_HEIGHT_DEFAULT + EXAMPLE_Y_GAP),
    width: 280,
  })
})
```

**位置不持久化**：每次进入按上述算法重新计算（拖拽仅影响当前会话状态）。

### 连线规则

| 连线 | 起点 | 终点 | 样式 | label |
|------|------|------|------|-------|
| detail → example × N | detail 卡 | 每张 example 卡 | 实线 + 绿色 + 箭头 | 「应用」 |
| source → extended | 源卡（detail 或 example） | extended 卡 | 虚线 + 橙色 + 箭头 | 「提问延伸」 |

`card-connections.tsx` 简化为两类规则。

### 划词提问交互

1. 用户在 detail / example 内容区选中文字（≤30 字）
2. `selection-popup.tsx` 在选区上方弹出「💬 对「XXX」提问」
3. 点击 → POST `/api/micro-learning/[id]/ask`，期间 popup 显示 loading
4. 拿到 ExtendedCard → append 到本地 cards/extendedCards、自动布局到画布右侧、画虚线
5. 失败 → toast 提示，popup 自动关闭

### 工具栏

`components/micro-learning/toolbar.tsx`：

```
[KP 名称 chip] [N 张卡片] | [完成学习 / 学完了，继续练习]
```

- 移除 V1 的「保存中…」状态（创建即落库）
- 「完成学习」按钮：有 returnTo → router.push(returnTo)；无 → router.push(`/banks/${bankId}`)
- 移除「历史记录」按钮（列表移到题库详情页面板）

### 题库详情页·微学习列表面板

新组件 `components/banks/micro-learning-list-panel.tsx`：
- 折叠面板默认展开，标题「微学习记录（N）」
- 表格行：`{kpName} | {sessionName ?? "手动"} | {N 道例题} | {N 张延伸卡} | {时间}` + 「查看」「重新学习」按钮
- 「查看」→ `/micro-learning/[id]`
- 「重新学习」→ `/micro-learning/new?kpId=X&bankId=Y`
- 空态：「该题库还没有微学习记录，可从知识点入口开始」

嵌入位置：`app/banks/[id]/page.tsx` 或对应客户端组件中（紧邻图谱组件下方）。

---

## 文件清单

### 新增

| 文件 | 用途 |
|------|------|
| `types/micro-learning.ts` | 重写：新模型类型 |
| `lib/ai/generate-micro.ts` | 重写：JSON Mode 输出详解 + 例题分析；含 `regenerateExampleAnalysis` 子函数 |
| `app/api/micro-learning/route.ts` | POST 创建 + GET 列表（按 bankId） |
| `app/api/micro-learning/[id]/route.ts` | GET 单条 |
| `app/api/micro-learning/[id]/ask/route.ts` | POST 划词追问 |
| `app/api/micro-learning/[id]/retry-example/route.ts` | POST 单题重试 |
| `app/micro-learning/new/page.tsx` | 创建中转页 |
| `app/micro-learning/[id]/page.tsx` | 详情页（替换 V1 `[knowledgePointId]`） |
| `components/banks/micro-learning-list-panel.tsx` | 题库详情页·微学习列表面板 |

### 修改

| 文件 | 改动 |
|------|------|
| `lib/db/schema.ts` | 删除 `microLearningRecords`，新增 `microLearnings` |
| `lib/ai/ask-question.ts` | 输入参数微调（直接接收 KP 名称、源内容、选词；不再返回 connection） |
| `types/index.ts` | 重新导出新类型 |
| `components/micro-learning/micro-learning-canvas.tsx` | 简化为 3 类卡 + 新布局算法 |
| `components/micro-learning/learning-card.tsx` | 重写：detail / example / extended 三种 type，example 卡新增题面/选项/答案布局 |
| `components/micro-learning/card-connections.tsx` | 简化为两类连线规则 |
| `components/micro-learning/selection-popup.tsx` | 调用新 ask 路由 |
| `components/micro-learning/toolbar.tsx` | 移除「保存」逻辑，改 returnTo 导航 |
| `components/knowledge-graph/node-popup.tsx` | 启用「进入微学习」按钮 |
| `components/knowledge-graph/graph-view.tsx` | 透传 `bankId` 给 node-popup |
| `app/banks/[id]/page.tsx`（或客户端组件） | 嵌入 `MicroLearningListPanel` |

### 删除

| 文件 | 理由 |
|------|------|
| `app/micro-learning/[knowledgePointId]/page.tsx` | 路由形态变更 |
| `app/api/micro-learning/generate/route.ts` | 合并到 POST `/api/micro-learning` |
| `app/api/micro-learning/complete/route.ts` | 创建即落库，无需「完成」端点 |
| `app/api/micro-learning/history/route.ts` | 改为 GET `/api/micro-learning?bankId=` |
| `app/api/micro-learning/history/[id]/route.ts` | 改为 GET `/api/micro-learning/[id]` |
| `components/micro-learning/history-drawer.tsx` | 列表面板替代 |
| `lib/db/migrations/<旧 micro_learning_records 迁移>` | 配合表重建（视实际迁移文件情况而定，必要时新迁移 drop+create） |

---

## 边界与约束

### 本次范围

1. 三个入口（KP / Session / 题库列表）的 API 与前端实现
2. 数据库重建迁移（drop 旧 `micro_learning_records` + create `micro_learnings`）
3. 划词提问 + 延伸卡完整闭环
4. 单题分析重试（仅 API + 单卡触发）
5. 题库详情页内嵌的微学习列表面板

### 本次不做

1. **Session-Agent 的端到端集成**：本次提供 API 契约（接收 sessionId/focusHint）+ returnTo 跳转能力，session 引擎调用方在 practice-flow 模块完成（已在 practice-flow spec 中 stub `microLearningId`）。
2. **卡片位置持久化**：每次打开都按算法计算默认布局，拖拽仅在当前会话有效。
3. **跨题库 KP 共享**：`micro_learnings.bankId` 是必填，不同题库的同名 KP 视为不同来源。
4. **微学习内容编辑**：用户不能改 detailedExplanation / example analysis 文本。
5. **批量重新生成**：仅支持单题 retry-example，不支持整体重生（需要重新点「重新学习」产生新记录）。

### 风险

- **AI JSON Mode 稳定性**：DeepSeek/Qwen JSON Mode 偶发返回非法 JSON。保底策略：1 次重试，失败返回 503 + 前端「重新生成」按钮。**绝不静默 fallback 到不完整内容**。
- **生成延迟 6-12 秒**：单次 prompt 同时生成详解 + 3 道例题分析，token 输出量约 1300。骨架屏 + 「AI 正在生成学习卡片…」文案过渡。
- **数据迁移**：开发环境直接 drop 旧表后建新表，**生产环境本次不涉及**（项目尚未上线）。Drizzle 迁移文件需手写或借助 `drizzle-kit generate` 后审查。
- **`bankId` 反推依赖**：依赖 `knowledge_points.bank_id` 字段存在；若 KP 表未冗余 bankId 则需先调整 KP 表（已在现有 schema 中确认存在则无需）。

---

## 验收要点

1. 从知识图谱节点弹窗「进入微学习」→ 跳转 `/micro-learning/new?kpId=...&bankId=...` → 骨架屏 → 自动跳到 `/micro-learning/[id]` → 渲染 1 张详解卡 + 2-3 张例题卡。
2. 在详解卡或例题卡正文中选中文字 → 弹「💬 对「XX」提问」→ 点击 → 画布右侧追加延伸卡 + 虚线连接源卡。
3. 题库详情页内嵌「微学习记录」面板列出所有记录，「查看」进入只读详情，「重新学习」产生新记录。
4. 例题卡若 `analysis` 为空，单卡显示「AI 分析缺失，点击重试」按钮，点击后只重试该题、其他卡不变。
5. POST `/api/micro-learning` 携带 `sessionId` + `focusHint` 时，记录写入字段，前端用作 prompt 构造。
6. `?returnTo=/practice/[sessionId]` 透传到详情页，工具栏「学完了，继续练习」跳回该 URL。
