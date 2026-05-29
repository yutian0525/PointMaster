# 练习流程实现设计（Phase 1 子集）

**日期**：2026-05-29
**基于**：`docs/PRD/PointMaster 慧刷题 PRD V2.0.md`、`docs/design/v2/practice.html`
**版本**：v1.0

---

## 1. 实现范围

### 包含
- 题库详情页"开始练习"入口
- 练习页核心闭环：Block 化做题 → Agent 路由决策 → 接受建议进入下一 Block
- 仅支持 **选择题（单选/多选）** 与 **判断题** 两类题型
- 真实 LLM Agent 路由决策（统一 LLM 客户端，遵循 PRD 附录 A prompt）
- `practice_sessions` / `session_blocks` / `session_steps` / `answer_records` 完整持久化
- 练习页内"完成"面板，含本次统计

### 不包含（本次明确不做）
- 微学习页面集成（Agent 给出 `micro_learning` 时弹窗仅显示提示，按钮置灰）
- 主观题（填空/简答/计算）与 LLM 判分
- 用户覆盖机制中的 `继续刷题` / `选择其他知识点` / `手动微学习` 三个分支
- Session 详情/回顾页
- 掌握度报告页
- session 跨端并发控制

### 用户可执行的操作
- 答题（点击选项 → 提交 → 看反馈 → 下一题）
- block 末：**接受 Agent 建议** 或 **结束练习**
- 任意时刻：**结束练习**

---

## 2. 数据模型

### 2.1 新增表（drizzle schema 追加）

```typescript
// lib/db/schema.ts

export const practiceSessions = sqliteTable("practice_sessions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  status: text("status").notNull(),  // active_quiz | awaiting_decision | completed
  currentBlockIndex: integer("current_block_index").notNull().default(0),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  pendingDecision: text("pending_decision"),  // JSON of AgentDecision; null 当 status != awaiting_decision
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessionBlocks = sqliteTable("session_blocks", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id),
  blockIndex: integer("block_index").notNull(),
  knowledgePointIds: text("knowledge_point_ids").notNull(),  // JSON string[]
  difficultyMin: real("difficulty_min").notNull(),
  difficultyMax: real("difficulty_max").notNull(),
  questionTypes: text("question_types").notNull(),  // JSON string[] of QuestionType
  questionIds: text("question_ids").notNull(),  // JSON string[]
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
});

export const answerRecords = sqliteTable("answer_records", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id),
  blockId: text("block_id").notNull().references(() => sessionBlocks.id),
  questionId: text("question_id").notNull().references(() => questions.id),
  userAnswer: text("user_answer").notNull(),
  isCorrect: integer("is_correct").notNull(),  // 0/1
  score: real("score").notNull(),  // 0~1
  timeSpent: integer("time_spent").notNull(),  // 秒
  createdAt: integer("created_at").notNull(),
});

export const sessionSteps = sqliteTable("session_steps", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id),
  stepIndex: integer("step_index").notNull(),
  stepType: text("step_type").notNull(),  // practice_block | agent_decision
  data: text("data").notNull(),  // JSON
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  createdAt: integer("created_at").notNull(),
});
```

### 2.2 现有表的复用
- `userMastery`：每次答题后更新 mastery/confidence/streak
- `questions.questionType`：仅查询 `choice` / `multi_choice` / `true_false` 三种值
- `questions.difficulty`：在 selector 中按 [min, max] 过滤

### 2.3 status 枚举与转移

```
[create]
   ↓
   ├─→ active_quiz ──[做完 block 末题]──→ awaiting_decision
   │                                          │
   │                                          ├─[accept]──→ active_quiz (新 block)
   │                                          │
   │                                          └─[finish]──→ completed
   │
   └─[finish 中途]──→ completed
```

### 2.4 step_steps.data 结构

**practice_block**（block 结束时写入）：
```json
{
  "blockIndex": 1,
  "knowledgePointIds": ["kp_xxx"],
  "difficultyRange": [0.3, 0.6],
  "questionIds": ["q1", "q2", ...],
  "stats": { "total": 5, "correct": 3, "avgTime": 28 },
  "masterySnapshot": { "kp_xxx": { "before": 0.45, "after": 0.55 } }
}
```

**agent_decision**（用户处理建议时写入）：
```json
{
  "agentSuggestion": {
    "action": "micro_learning",
    "reason": "...",
    "params": {...},
    "nextBlockPreview": {...}
  },
  "userChoice": "accepted" | "finish",
  "rawError": "...原始 LLM 输出（仅在 zod 校验失败回退时存）..."
}
```

---

## 3. API 设计

所有 API 用 zod 验证请求/响应。错误统一返回 `{error: string}` + 4xx/5xx 状态码。

| 路径 | 方法 | 输入 | 输出 |
|---|---|---|---|
| `/api/sessions` | POST | `{bankId}` | `{sessionId}` |
| `/api/sessions/[id]` | GET | — | 完整恢复包（见 3.1） |
| `/api/sessions/[id]/next-block` | POST | `{action, params}`（首次进入或 accept-decision 后调用） | `{blockId, blockIndex, questionCount}` |
| `/api/sessions/[id]/current-question` | GET | — | 题目（不含答案/解析） |
| `/api/sessions/[id]/submit-answer` | POST | `{questionId, userAnswer, timeSpent}` | `{isCorrect, score, correctAnswer, analysis, masteryDelta, isBlockComplete}` |
| `/api/sessions/[id]/complete-block` | POST | — | `{decision: AgentDecisionJSON}` |
| `/api/sessions/[id]/accept-decision` | POST | — | `{nextStatus, nextBlockId?}` |
| `/api/sessions/[id]/finish` | POST | — | `{summary}` |
| `/api/sessions/[id]/summary` | GET | — | `{stats, masteryChanges}` |

### 3.1 GET /api/sessions/[id] 响应结构（完整恢复）

```typescript
{
  session: {
    id: string,
    status: "active_quiz" | "awaiting_decision" | "completed",
    currentBlockIndex: number,
    currentQuestionIndex: number,
    pendingDecision: AgentDecision | null,
  },
  bank: { id: string, name: string, totalQuestions: number },
  currentBlock: {
    id: string,
    blockIndex: number,
    knowledgePointNames: string[],
    questionCount: number,
    answeredCount: number,
    correctCount: number,
  } | null,
  currentQuestion: {
    id: string,
    type: "choice" | "multi_choice" | "true_false",
    content: string,
    options: string[],  // 判断题为 ["正确", "错误"]
    difficulty: number,
    indexInBank: number,
  } | null,
  masteryByKp: Record<string, { name: string, mastery: number, confidence: number, trend: "up"|"down"|"stable" }>,
  blockStats: { correct: number, wrong: number, answered: number },
  sessionStats: { totalAnswered: number, totalBlocks: number, durationSec: number, microLearningsCount: number },
}
```

### 3.2 提交答题流程

```
POST /api/sessions/[id]/submit-answer
  ↓
1. 加载 session、当前 block、当前题
2. 调 grade-objective 判分（type-aware）
3. 写 answer_records
4. 调 mastery-update 更新 user_mastery（按主知识点）
5. session.currentQuestionIndex++
6. 如果 currentQuestionIndex >= block.questionIds.length：
     - block.endedAt = now
     - 写 practice_block step
     - session.status = awaiting_decision（但不清 currentBlockIndex）
     - 返回 isBlockComplete=true
   否则：
     - 返回 isBlockComplete=false
7. 返回判分结果给前端
```

### 3.3 complete-block → accept-decision

```
POST /complete-block
  → 调 lib/agent/decide-route(sessionId)
  → 持久化到 session.pendingDecision
  → 返回给前端

POST /accept-decision
  → 读 session.pendingDecision
  → 写 agent_decision step (userChoice="accepted")
  → 根据 action 转移：
     - continue_practice / switch_knowledge_point: 调 next-block 内部逻辑创建新 block
     - micro_learning: status 保持 awaiting_decision（按钮在前端置灰，实际不会到这里）
     - finish: status=completed
  → 清 pendingDecision
  → 返回 nextStatus
```

### 3.4 finish

```
POST /finish (任何 status 都允许)
  → 如果有 pendingDecision，写 agent_decision step (userChoice="finish")
  → status=completed, endedAt=now, pendingDecision=null
  → 返回汇总数据
```

---

## 4. 模块拆分

### 4.1 新增目录与文件

```
lib/
├── agent/
│   ├── prompts.ts                  # PRD 附录 A 路由决策 prompt
│   ├── decide-route.ts             # 调 LLM + zod 校验 + safe-default 回退
│   └── types.ts                    # AgentDecision zod schema
├── algorithm/
│   ├── grade-objective.ts          # 客观题判分（单选/多选/判断）
│   ├── mastery-update.ts           # PRD 4.2 公式（统一入口）
│   └── question-selector.ts        # 按约束选题，去重 session 内已答
├── practice/
│   ├── session-service.ts          # 创建/恢复 session、状态转移
│   ├── block-service.ts            # 规划 block + 取当前题 + 完成 block
│   └── step-recorder.ts            # 写 session_steps 工具
└── db/schema.ts                    # 追加 4 张表

app/
├── practice/[sessionId]/page.tsx   # 练习页主入口（client，统一容器）
├── api/sessions/
│   ├── route.ts                    # POST /sessions
│   ├── [id]/
│   │   ├── route.ts                # GET
│   │   ├── next-block/route.ts
│   │   ├── current-question/route.ts
│   │   ├── submit-answer/route.ts
│   │   ├── complete-block/route.ts
│   │   ├── accept-decision/route.ts
│   │   ├── finish/route.ts
│   │   └── summary/route.ts

components/practice/
├── practice-topbar.tsx             # 顶栏：题库 / 知识点 / Block / 状态标签 / 结束按钮
├── block-progress.tsx              # Block 进度点（done/wrong/current/empty）
├── question-card.tsx               # 统一题卡容器（按 type 分发到子组件）
├── question-card-choice.tsx        # 单选/多选
├── question-card-truefalse.tsx     # 判断
├── answer-feedback.tsx             # 答完反馈（解析 + 用时 + 得分）
├── practice-sidebar.tsx            # 右侧栏（掌握度 / Block 统计 / Session 概览）
├── agent-decision-modal.tsx        # Agent 决策弹窗（含流式打字、按钮置灰逻辑）
└── completion-panel.tsx            # 结束态面板（统计 + 返回按钮）
```

### 4.2 题库详情页改动
- `app/banks/[id]/page.tsx`：在头部信息或 stats 区附近加 "开始练习" 主按钮，点击 POST /api/sessions 后 router.push 到 `/practice/${sessionId}`
- 不改既有知识图谱、难度分布等

---

## 5. 算法实现细节

### 5.1 grade-objective.ts

```typescript
type GradeInput =
  | { type: "choice", userAnswer: string, correctAnswer: string }
  | { type: "multi_choice", userAnswer: string, correctAnswer: string }
  | { type: "true_false", userAnswer: string, correctAnswer: string };

interface GradeResult { isCorrect: boolean; score: number; }

export function grade(input: GradeInput): GradeResult {
  if (input.type === "choice" || input.type === "true_false") {
    const ok = input.userAnswer.trim().toUpperCase() === input.correctAnswer.trim().toUpperCase();
    return { isCorrect: ok, score: ok ? 1 : 0 };
  }
  // multi_choice: 完全匹配才得分（PRD V2.0 未明确部分得分，本次按全对全错）
  const userSet = new Set(input.userAnswer.split(",").map(s => s.trim().toUpperCase()));
  const correctSet = new Set(input.correctAnswer.split(",").map(s => s.trim().toUpperCase()));
  const ok = userSet.size === correctSet.size && [...userSet].every(x => correctSet.has(x));
  return { isCorrect: ok, score: ok ? 1 : 0 };
}
```

### 5.2 mastery-update.ts

直接套 PRD 4.2 的公式：

```typescript
interface UpdateInput {
  current: { mastery: number, confidence: number, streak: number };
  score: number;          // 0~1（本次只 0/1）
  difficulty: number;     // 0~1
  answerTime: number;     // 秒
  expectedTime: number;   // 秒，questions.expectedTime 没有时默认 30
}

export function updateMastery(i: UpdateInput) {
  let { mastery, confidence, streak } = i.current;
  if (i.score >= 0.7) {
    const timeFactor = clamp(1 - i.answerTime / i.expectedTime, 0, 1);
    mastery += i.score * i.difficulty * 0.1 * (1 + timeFactor * 0.5);
    confidence += 0.15;
    streak = streak > 0 ? streak + 1 : 1;
  } else {
    mastery -= (1 - i.score) * i.difficulty * 0.12;
    confidence += 0.10;
    streak = streak < 0 ? streak - 1 : -1;
  }
  return {
    mastery: clamp(mastery, 0, 1),
    confidence: clamp(confidence, 0, 1),
    streak,
  };
}
```

### 5.3 question-selector.ts

```typescript
interface SelectInput {
  bankId: string;
  knowledgePointIds: string[];
  difficultyRange: [number, number];
  questionTypes: string[];   // ["choice","multi_choice","true_false"]
  size: number;
  excludeQuestionIds: string[];   // 本 session 已答过的
}

// 通过 question_knowledge join，取 questionType IN types AND difficulty BETWEEN range
// AND id NOT IN exclude
// ORDER BY RANDOM() LIMIT size
// 不够时按以下顺序放宽：
//   1. 难度区间 ±0.1
//   2. 不限制知识点（仍限 bank）
//   3. 仍不够 → 抛 SelectorExhaustedError
```

selector 抛 `SelectorExhaustedError` 时，complete-block 路径不调 Agent，直接 finish + 提示。

### 5.4 decide-route.ts（Agent）

```typescript
const AgentDecisionSchema = z.object({
  action: z.enum(["continue_practice", "switch_knowledge_point", "micro_learning", "finish"]),
  reason: z.string().min(1),
  params: z.record(z.any()),  // 各 action 字段不同，下游再细分
  next_block_preview: z.object({
    size: z.number().int().positive().optional(),
    knowledge_points: z.array(z.string()).optional(),
    difficulty_range: z.tuple([z.number(), z.number()]).optional(),
    note: z.string().optional(),
  }).optional(),
});

export async function decideRoute(sessionId: string): Promise<AgentDecision> {
  const ctx = await buildAgentContext(sessionId);  // 拼 mastery/block_summary/history/available_kps
  const messages = buildPrompt(ctx);
  try {
    const raw = await llm.chat({ messages, response_format: { type: "json_object" } });
    return AgentDecisionSchema.parse(JSON.parse(raw));
  } catch (e) {
    return safeDefault(ctx);  // {action: "continue_practice", reason: "Agent 解析失败，继续巩固当前知识点", ...}
  }
}
```

`buildAgentContext` 从 DB 计算近 3 个 block 的 mastery 趋势（升/降/稳定），保证 prompt 输入完整。

---

## 6. 前端组件细节

### 6.1 practice/[sessionId]/page.tsx

`'use client'` 组件，结构：
```tsx
const { data, mutate } = useSWR(`/api/sessions/${id}`, fetcher);

if (!data) return <Skeleton />;
if (data.session.status === "completed") return <CompletionPanel data={data} />;

return (
  <>
    <PracticeTopbar ... />
    <div className="practice-body">
      <main>
        <BlockProgress ... />
        <QuestionCard
          question={data.currentQuestion}
          onSubmit={handleSubmit}
          feedback={feedback}
          onNext={handleNext}
        />
      </main>
      <PracticeSidebar ... />
    </div>
    {data.session.status === "awaiting_decision" && (
      <AgentDecisionModal
        decision={data.session.pendingDecision}
        onAccept={handleAccept}
        onFinish={handleFinish}
      />
    )}
  </>
);
```

`handleSubmit` 调 submit-answer，把返回的 feedback 设到本地 state，等用户点"下一题"再继续。如果 `isBlockComplete`，"下一题"按钮文案改为"完成本 Block"，点击后调 complete-block 拿 decision，弹窗显示。

### 6.2 AgentDecisionModal

设计稿里的 `agent-modal-backdrop` + 流式打字 + 建议卡片 + 知识点掌握度一览。本次实现简化为：
- 加载态：转圈 + "正在分析 block 表现"
- 流式打字：直接把 `decision.reason` 一段文字打出来（暂不做 LLM streaming，模拟即可）
- 建议卡片：根据 `decision.action` 显示不同图标/文案
- 一览：复用 sidebar 的 `masteryByKp` 数据
- footer 仅两个按钮：**接受建议** / **结束练习**
  - 当 `action === "micro_learning"` 时，"接受建议" 置灰 + 提示 "微学习功能暂未集成，请选择结束练习"

### 6.3 题型组件

**question-card-choice.tsx**：
- `type="choice"`：单选，点击切换；提交后高亮正确/错误
- `type="multi_choice"`：多选，点击 toggle；底部提示"已选 X 项"；提交按钮独立

**question-card-truefalse.tsx**：
- 两个大按钮（正确/错误）

两者都接 `onSubmit(userAnswer)` + 接 `feedback`（已答时显示反馈区）。

### 6.4 CompletionPanel

显示：
- 大字"练习完成 ✓"
- 本次统计：题量 / 正确率 / 用时 / Block 数 / 涉及知识点
- 各知识点掌握度变化条
- 按钮：返回题库 / 重新开始练习（创建新 session）

---

## 7. 错误与边界

| 场景 | 处理 |
|---|---|
| LLM JSON 校验失败 | 用 safe default `{action:"continue_practice", knowledge_points:[当前知识点], size:5, difficulty_range:[0.3,0.7]}`，原始输出存 step.data.rawError |
| Agent 返回 `micro_learning` | 弹窗显示 + "接受建议"按钮置灰 + 文案提示 |
| selector 题量不足 | complete-block 直接走 finish，前端跳完成面板，提示"题库中符合条件的题目不足" |
| 网络中断 | submit-answer 失败时前端保留选项 + 显示"重试"按钮 |
| status 与请求不匹配 | API 返回 409 + `{error: "session 状态不匹配"}`，前端 mutate 重拉 GET |
| 同 session 被多端打开 | 不做并发控制；最后写入者赢 |
| 题库为空 / 没有符合题型的题 | POST /sessions 时校验，返回 400 |

---

## 8. 测试策略

### 8.1 单元测试
- `grade-objective.test.ts`：单选完全匹配、多选乱序匹配、判断、空答案
- `mastery-update.test.ts`：答对加分、答错减分、边界 clamp、streak 翻转
- `question-selector.test.ts`：约束筛选、去重、放宽难度、放宽知识点、耗尽抛错

### 8.2 集成测试
- `lib/agent/decide-route.test.ts`：mock LLM，测合法 JSON / 非法 JSON / 网络失败三条路径
- `lib/practice/session-service.test.ts`：completes-status-transitions
- API：完整 happy path（create → next-block → 答 5 题 → complete-block → accept → 新 block）

### 8.3 手动验证
- dev server 验证：
  - 题库详情页 → 开始练习 → 落到第一题
  - 答完 5 题 → 弹窗显示 → 接受建议 → 进入下一 block
  - 中途结束 → 完成面板
  - 刷新页面 → 状态正确恢复

---

## 9. 实现顺序建议

1. db schema 追加 + drizzle 迁移生成
2. 算法层（grade / mastery / selector）+ 单测
3. lib/agent/（prompts / types / decide-route）+ mock 单测
4. lib/practice/（session-service / block-service / step-recorder）+ 单测
5. API routes（按 happy path 顺序：create → next-block → current-question → submit → complete-block → accept → finish → summary）
6. 题库详情页"开始练习"按钮
7. 练习页 page.tsx + 组件树（topbar、block-progress、question-card、sidebar）
8. agent-decision-modal
9. completion-panel
10. 端到端手动验证

---

## 10. 设计规范遵循

样式严格按 `docs/design/v2/practice.html` 与 `shared.css` 的 token：
- 主色 `#9fb997` / `#6b8c64`
- 背景 `#f4f2f0`
- 圆角 `--r-md`/`--r-lg`/`--r-xl`
- 字体 Fraunces（标题）/ Plus Jakarta Sans（正文）

不引入新的 UI library，复用 shadcn/ui 已有组件 + Tailwind 自定义 class。
