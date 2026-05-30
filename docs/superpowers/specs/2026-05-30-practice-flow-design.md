# PointMaster V3.0 刷题闭环 — 设计文档

| 项 | 值 |
|---|---|
| 文档日期 | 2026-05-30 |
| 对应 PRD | `docs/PRD/PointMaster 慧刷题 PRD V3.0.md` |
| 对应设计稿 | `docs/design/v3/practice-flow.html` |
| 范围 | 选题库 → AI 排序 → 三区刷题页 → 完成弹窗 → 报告页 完整链路 |

---

## 1. 设计目标

把 PRD V3.0 的「用户主导按知识点顺序刷题」主线在现有 Next.js + Drizzle + better-sqlite3 项目上落地。落地后用户能：

1. 在 plan 页选题库，输入自定义提示词，看到 AI 生成的知识点刷题顺序
2. 进入 quiz 页按顺序逐知识点刷题，每题作答→提交→看判分/解析/可问 AI（多轮）→下一题
3. 知识点完成（mastery≥0.8∧confidence≥0.7 或题池耗尽）时弹窗选择 [重新刷题 / 错题重刷 / 下一知识点]
4. 全部知识点处理完或主动结束后看到掌握度报告
5. 中途离开后通过题库详情页恢复刷题

V2.0 已实现的能力（题库导入、AI 知识点提取、知识图谱构建、微学习、单题问 AI 的 LLM 抽象）全部复用，不重写。

## 2. 模块边界

```
app/practice/[sessionId]/{quiz,report}/page.tsx     渲染层
app/practice/new/page.tsx                            渲染层（plan）
        │ fetch
        ▼
app/api/sessions/...                                 编排层（API routes）
app/api/plan-preview                                 编排层
        │ 调用
        ▼
lib/practice/{mastery,grader,selector,completion,session-state}.ts
                                                     算法层（纯函数 + 查询）
lib/ai/plan-order.ts                                 LLM 排序规划
```

**职责切分**：
- **渲染层**：组件 + Zustand 临时态；不写业务逻辑；所有"事实"来自 API 响应
- **编排层**：解析请求 → 查 DB → 调算法 → 写 DB（事务）→ 返回响应
- **算法层**：纯函数；DB 写入由 API route 统一执行；可单独单测

**关键纪律**：客户端不做乐观更新（除选项点击的纯 UI 反馈），mastery / streak / 已答题数等所有数据均以服务端响应为准。

## 3. 数据库 Schema 变更

新增 4 张表（`lib/db/schema.ts` 追加，drizzle-kit 生成迁移）。

### 3.1 `practice_sessions`
```typescript
{
  id: text PK,
  bankId: text → question_banks.id,

  knowledgePointOrder: text JSON,      // [{id, name, order, reason, totalQuestions}]
  kpMasterySnapshot: text JSON,        // {[kpId]: {mastery, confidence}} — session 启动时拍照
  
  currentKpIndex: integer default 0,   // 当前在 knowledgePointOrder 中的位置
  currentMode: text default "normal",  // "normal" | "redo" | "wrong-redo"
  currentRoundIndex: integer default 1,
  
  customPrompt: text nullable,
  planningNote: text nullable,         // AI 排序的一句话理由
  
  status: text default "active",       // "active" | "completed" | "abandoned"
  
  startedAt: integer,
  endedAt: integer nullable,
  createdAt: integer,
  updatedAt: integer,
}
```
索引：`(bank_id, status)` — 题库详情页查 active session。

### 3.2 `answer_records`
```typescript
{
  id: text PK,
  sessionId: text → practice_sessions.id,
  questionId: text → questions.id,
  knowledgePointId: text → knowledge_points.id,

  userAnswer: text,                    // 多选规范化为排序后字符串如 "AB"
  correctAnswer: text,
  score: integer,                      // 0 | 1
  timeSpent: integer,                  // 秒

  roundIndex: integer,                 // 1=normal, 2=redo, 3..N=wrong-redo 子轮
  mode: text,                          // "normal" | "redo" | "wrong-redo"

  createdAt: integer,
}
```
索引：`(session_id, knowledge_point_id, mode, round_index)` — 算"本轮已做/答错"。

> **注意**：不再在此表存 ai_question / ai_answer。多轮问答移到独立表（见 3.4）。

### 3.3 `user_mastery`
```typescript
{
  id: text PK,
  bankId: text → question_banks.id,
  knowledgePointId: text → knowledge_points.id,

  mastery: real default 0,
  confidence: real default 0,
  streak: integer default 0,

  testedCount: integer default 0,
  correctCount: integer default 0,

  lastUpdated: integer,
}
```
唯一索引：`(bank_id, knowledge_point_id)`。**跨 session 累积**——重新刷题不重置，掌握度增量叠加。

### 3.4 `answer_ai_messages`
```typescript
{
  id: text PK,
  answerRecordId: text → answer_records.id,
  question: text,                      // 用户提问
  answer: text,                        // AI 回答
  createdAt: integer,
}
```
索引：`(answer_record_id, created_at)` — 按时间序拉对话。

## 4. 算法层（`lib/practice/`）

### 4.1 `mastery.ts` — 掌握度更新（PRD §6.2）
```typescript
applyAnswer(prev, score, difficulty, answerTime, expectedTime) → newMasteryState
```
- 答对：`mastery += difficulty * 0.1 * (1 + timeFactor * 0.5)`，`confidence += 0.15`
- 答错：`mastery -= difficulty * 0.12`，`confidence += 0.10`
- streak 同号累加，异号重置
- mastery / confidence clamp 到 0~1
- 缺失 difficulty 兜底 0.5、缺失 expectedTime 兜底 60 秒

### 4.2 `grader.ts` — 答案比对
```typescript
normalizeAnswer(raw, type) → "AB"  // 去除非字母字符 → 大写 → 去重 → 排序
grade(userAnswer, correctAnswer, type) → 0 | 1
```
单选/判断比对单字母；多选规范化后整串比对，**部分对部分错给 0 分**（PRD §6.1）。

### 4.3 `selector.ts` — 选下一题
```typescript
pickNextQuestion({ sessionId, bankId, kpId, mode, roundIndex }, db) → Question | null
```
- 题池：`questions JOIN question_knowledge WHERE kp_id=? AND is_primary=1`
- mode 分支：
  - `normal` / `redo`：题池 - 本轮已做（本轮 = 当前 sessionId + kpId + mode + roundIndex）
  - `wrong-redo`：源 = `answer_records WHERE session=?, kp=?, round_index=currentRoundIndex-1, score=0` 的 questionId 集合，再去掉本子轮已做
- 排序：按 `difficulty` 升序，同难度按 `id`
- 题池为空返回 `null`

> `wrong-redo` 总是从 `roundIndex - 1` 取错题，不区分上一 round 是 normal/redo/wrong-redo。所以「错题重刷的错题再错」会进入下一 wrong-redo 子轮（roundIndex+=1），新子轮取的是上一子轮的错题。

### 4.4 `completion.ts` — 完成判定
```typescript
checkCompletion(pickResult, masteryState, mode) → "continue" | "complete"
```
- `pickResult === null` → `complete`
- `mode !== "wrong-redo"` 且 `mastery >= 0.8 && confidence >= 0.7` → `complete`
- 其他 → `continue`

`wrong-redo` 必须把错题集刷光才算完成（PRD §4.5「错题全部答对后再次触发完成选择」）。

阈值常量（写死，不进 DB）：
```typescript
export const COMPLETION_MASTERY_THRESHOLD = 0.8;
export const COMPLETION_CONFIDENCE_THRESHOLD = 0.7;
```

### 4.5 `session-state.ts` — 拼装渲染 payload
单一函数返回 quiz 页所需的完整 state（见 §5.3）。复用于：plan 后跳转、提交后刷新、恢复 session、完成弹窗后跳转。

## 5. API 路由

### 5.1 `POST /api/plan-preview`
**Body**: `{ bankId, customPrompt? }`  
**响应**: `{ orderedKnowledgePoints: [{id, name, order, reason, totalQuestions}], planningNote }`

仅生成预览，不入库。供 plan 页反复调用（用户改提示词重排）。

**LLM 失败兜底**：`plan-order.ts` 内部 try/catch，LLM 调用失败或返回不合法 JSON 时，自动 fallback 到「按 `prerequisite_ids` 拓扑排序」——前置无依赖的 KP 排前面，依赖深度大的排后面。`planningNote` 在兜底时填 `"AI 服务暂不可用，已按知识点依赖关系自动排序"`。前端接收的响应格式不变。

### 5.2 `POST /api/sessions`
**Body**: `{ bankId, customPrompt?, orderedKnowledgePoints, planningNote }`

前端把 plan-preview 的结果原样回传。后端：
1. 算每个 KP 的 `totalQuestions`（重新 query 防篡改）
2. 拍 `kpMasterySnapshot` —— 该题库当前所有 KP 的 mastery/confidence
3. 写 `practice_sessions`（mode=`normal`, round=1, idx=0, status=`active`）
4. 返回 `QuizPayload`

### 5.3 `GET /api/sessions/[id]/state`
返回完整 `QuizPayload`（见 §6）。**做题页加载、提交后刷新、恢复入口判 active session 都走这一个接口**。

### 5.4 `GET /api/sessions/[id]/next-question`
**响应**: `{ question: Question | null, completionTriggered: boolean }`

不改 DB。selector + completion 组合判定。`question.options` 解析为数组返回；附带 `difficulty / expectedTime / questionType / analysis`。`analysis` 在提交后才暴露给前端展示（next-question 不含 analysis，submit-answer 才带）。

### 5.5 `POST /api/sessions/[id]/submit-answer`
**Body**: `{ questionId, userAnswer, timeSpent }`

事务里：grader → 取 user_mastery → mastery.applyAnswer → 写 answer_records → upsert user_mastery。

**响应**:
```json
{
  "score": 0|1,
  "correctAnswer": "B",
  "analysis": "...",
  "mastery": { mastery, confidence, streak, testedCount, correctCount },
  "kpProgress": { answeredCount, correctRate },
  "answerRecordId": "..."
}
```

### 5.6 `POST /api/sessions/[id]/ask`
**Body**: `{ answerRecordId, question }`

调 `lib/ai/ask-question.ts`，输入 `(题干 + 选项 + 正确答案 + 解析 + 该 record 已有的对话历史 + 新提问)` 让 LLM 续写。每次 INSERT 一条 `answer_ai_messages`。  
**响应**: `{ messageId, question, answer, createdAt }`

### 5.7 `POST /api/sessions/[id]/advance`
**Body**: `{ action: "redo" | "wrong-redo" | "next-kp" | "skip" }`

- `redo`：`mode=redo, roundIndex+=1`，不动 currentKpIndex
- `wrong-redo`：`mode=wrong-redo, roundIndex+=1`
- `next-kp` / `skip`：`currentKpIndex+=1`，重置 `mode=normal, roundIndex=1`；超过末尾则 `status=completed`
- 返回新 `QuizPayload`

注：`wrong-redo` 时若上一 round 没有错题（全对），前端禁用按钮（disable + tooltip），后端不做兜底（防御性接收时返回 400 即可）。

### 5.8 `POST /api/sessions/[id]/finish`
将 session 置 `completed`，写 `endedAt`。返回 `{ ok: true }`。前端跳报告页。

### 5.9 `POST /api/sessions/[id]/abandon`
将 session 置 `abandoned`。供 ResumeBanner「重新开始」二次确认通过后调用。

## 6. QuizPayload（前后端共享类型）

```typescript
type QuizPayload = {
  session: {
    id: string;
    status: "active" | "completed" | "abandoned";
    currentKpIndex: number;
    currentMode: "normal" | "redo" | "wrong-redo";
    currentRoundIndex: number;
  };
  knowledgePoints: Array<{
    id: string;
    name: string;
    order: number;
    totalQuestions: number;
    answeredCount: number;     // 本 session 累积答过几题（distinct questionId）
    correctRate: number;       // 本 session 累积正确率
    mastery: number;           // 跨 session 累积（来自 user_mastery）
    status: "done" | "current" | "todo";
  }>;
  currentKp: { id: string; name: string };
  currentQuestion: {
    id: string;
    content: string;
    options: string[];
    questionType: "单选题" | "多选题" | "判断题";
    difficulty: number;
    expectedTime: number;
    // 提交后才填充：
    submitted?: {
      score: 0 | 1;
      correctAnswer: string;
      analysis: string;
      answerRecordId: string;
      aiMessages: Array<{ id, question, answer, createdAt }>;
    };
  } | null;
  mastery: { mastery, confidence, streak, testedCount, correctCount };
  overview: Array<{ kpId, name, mastery }>;
};
```

## 7. 前端页面

### 7.1 路由
```
app/practice/
├── new/page.tsx                       Plan 页（'use client'）
└── [sessionId]/
    ├── quiz/page.tsx                  Quiz 页（'use client'）
    └── report/page.tsx                Report 页（SSR）

app/banks/[id]/page.tsx                ← 注入 ResumeBanner
```

### 7.2 Plan 页（`app/practice/new/page.tsx`）

对应设计稿 [practice-flow.html:514-586](../../design/v3/practice-flow.html#L514-L586)。

组件树：
```
PlanPage
├── BankPicker         设计稿 .bank-pick — 选题库
├── PromptInput        设计稿 .prompt-box-v2 + .pchip
└── PlanResult (生成后展示)
    ├── AINote         设计稿 .ai-note
    ├── KpOrderList    设计稿 .result-list — 只读
    └── PlanCta        [开始刷题] btn-p — 调用 POST /api/sessions
```

**交互**：
- 进页面：本地 state 暂存 customPrompt、orderedKnowledgePoints、planningNote
- 点「生成刷题顺序」：`POST /api/plan-preview`，本地暂存结果
- 改提示词或点 chip：再次点击「生成刷题顺序」即重新调用
- 点「开始刷题」：`POST /api/sessions` 把暂存的结果回传入库 → 跳 `/practice/[id]/quiz`
- **未点「开始刷题」前不入库**（用户友好，不堆积空 session）

### 7.3 Quiz 页（`app/practice/[sessionId]/quiz/page.tsx`）

对应设计稿 [practice-flow.html:589-732](../../design/v3/practice-flow.html#L589-L732)。

组件树：
```
QuizPage
├── KpStrip
│   └── KpPill × N                  done / current / todo（MVP 仅展示，不支持点击跳转）
├── QuizMain
│   ├── QuestionMeta                第 N 题 / 题型 / 难度
│   ├── QuestionStem
│   ├── OptionList                  单选/多选/判断
│   ├── QuizActions                 [跳过] [提交答案]
│   ├── RevealBanner                提交后 ok/no
│   ├── AnalysisCard
│   ├── AskAIThread                 多轮 messages + 输入框
│   └── NextActions                 [下一题]
└── MasteryPanel                    aside
    ├── CurrentKpGauge              gauge×2 + streak
    └── BankOverview                所有 KP 的 mastery 进度条
```

**状态管理**（`useState`，对齐项目现有风格，不引入 Zustand）：
- 临时态：`selectedAnswer / submitted / loading / askInputDraft`
- `payload`：服务端响应整体覆盖
- 不做客户端乐观更新

**交互链路**：
```
1. mount → GET /state → render
2. 选项点击 → 本地 selectedAnswer
3. 「提交」→ POST /submit-answer
   → 更新 currentQuestion.submitted + mastery + KpStrip 当前 pill
4. （可选）「问 AI」→ 输入 → POST /ask → append message
5. 「下一题」→ GET /next-question
   → completionTriggered=true：弹 CompletionModal
   → 否则：渲染新题（清 selected/submitted）
6. 弹窗按钮 → POST /advance → 用响应覆盖 payload → 关弹窗
```

**KpPill 上的 mastery%** 来源 `knowledgePoints[i].mastery * 100`，颜色档：
- ≥80% hi（绿） / ≥50% mid（金） / <50% lo（玫瑰） / 未做(testedCount=0) 显示 "—"

### 7.4 Report 页（`app/practice/[sessionId]/report/page.tsx`）

对应设计稿 [practice-flow.html:735-793](../../design/v3/practice-flow.html#L735-L793)。SSR，直接读 DB。

聚合查询（纯 SQL）：
```
本次答题数      = count(*) from answer_records where session_id=?
整体正确率      = avg(score) ...
错题重刷数      = count(distinct knowledge_point_id) where mode='wrong-redo'
完成 KP 数      = knowledgePointOrder 切片到 currentKpIndex 中 mastery≥0.8 的个数
Δmastery        = user_mastery.mastery - kpMasterySnapshot[kpId].mastery
薄弱 KP        = mastery < 0.5 的 KP（含未练过的）
```

### 7.5 ResumeBanner（注入 `app/banks/[id]/page.tsx`）

服务端组件查 `practice_sessions WHERE bank_id=? AND status='active' LIMIT 1`，有则在题库标题下方渲染：
```
继续上次刷题：哈希表 11/24      [继续 →]   [重新开始]
```
- 「继续 →」直链 `/practice/[id]/quiz`
- 「重新开始」打开 `<AlertDialog>` 二次确认 →`POST /abandon` → 跳 `/practice/new?bankId=...`

## 8. 共享组件（`components/practice/`）

```
KpPill.tsx              一个 pill（含 mastery 颜色档）
KpStrip.tsx             横向滚动 + 当前 pill scrollIntoView
QuestionStem.tsx        题干渲染（支持 <code>）
OptionButton.tsx        单/多选/判断的统一按钮
OptionList.tsx          OptionButton 列表 + 选中态
RevealBanner.tsx        ok/no 横幅
AnalysisCard.tsx        解析卡
AskAIThread.tsx         多轮对话 + 输入
MessageBubble.tsx       一条消息（user/ai）
MasteryGauge.tsx        进度条（含 thresh）
MasteryPanel.tsx        区域③
CompletionModal.tsx     完成弹窗（设计稿 .complete-modal）
ResumeBanner.tsx        题库详情页用
```

每个组件接受明确 props，不直接读 store；store 只在 page 级消费。

## 9. 实现里程碑

### M1 — DB Schema + 类型
- `lib/db/schema.ts` 追加 4 表
- `drizzle-kit generate` 生成迁移
- `lib/practice/types.ts` 共享类型（QuizPayload / SelectorContext / MasteryUpdate / Question）

### M2 — 算法层 + 单测
- `lib/practice/mastery.ts` + `grader.ts` + `selector.ts` + `completion.ts`
- vitest 单测覆盖：mastery 公式、grader 多选规范化、selector 三种 mode、completion 判定

### M3 — Plan 页
- `lib/ai/plan-order.ts`（PRD 附录 A prompt + 拓扑排序兜底）
- `app/api/plan-preview/route.ts`
- `app/practice/new/page.tsx` + 子组件

### M4 — Session + Quiz 主链路
- `app/api/sessions/route.ts` POST
- `app/api/sessions/[id]/state/route.ts` GET
- `app/api/sessions/[id]/next-question/route.ts` GET
- `app/api/sessions/[id]/submit-answer/route.ts` POST
- `app/practice/[sessionId]/quiz/page.tsx` + KpStrip / QuestionStem / OptionList / RevealBanner / AnalysisCard / MasteryPanel
- `lib/stores/quiz-store.ts`

### M5 — 完成弹窗 + 推进 + 多轮问 AI
- `app/api/sessions/[id]/advance/route.ts`
- `app/api/sessions/[id]/ask/route.ts`
- `CompletionModal.tsx` + `AskAIThread.tsx`
- next-question 接入 completionTriggered

### M6 — 报告页 + 恢复入口
- `app/practice/[sessionId]/report/page.tsx`
- `app/api/sessions/[id]/finish/route.ts`
- `app/api/sessions/[id]/abandon/route.ts`
- `components/practice/ResumeBanner.tsx` 注入 `app/banks/[id]/page.tsx`

## 10. 范围外（明确不做）

- 多选「部分对部分错」给半分 — 按 PRD §6.1，0/1
- 主观题 / 填空题
- 微学习入口接入做题页
- AI 报告总结
- 知识图谱可视化
- mastery 阈值可调（写死 0.8 / 0.7）
- 拖拽调整知识点顺序（已在 brainstorming 中否决）
- KP 顺序"题目挂在最靠后知识点"备选逻辑（用 `is_primary`）
- 全局未完成 session 指示器（仅题库详情页 ResumeBanner）
- KpPill 点击跳转知识点（MVP 仅高亮当前 + 状态展示，不可点击；将来需要时单独走 advance API 加 `targetKpIndex` 参数扩展）

## 11. 测试策略

- **单测**：`lib/practice/` 全覆盖（mastery 公式 / grader 多选规范化 / selector 三种 mode 选题 / completion 判定）；引入 **vitest** 作为新 devDep（`npm run test` 启动）
- **手测**：API 路由 + 前端页面，按 §9 每个 milestone 验收点测一遍
- **不写**：API route 单测、E2E、组件 Storybook

## 12. 关键设计决策（备查）

| 决策 | 选择 | 理由 |
|---|---|---|
| 选题/算分/状态权威 | 服务端 | better-sqlite3 同步 IO 友好；DB 永远是真相；恢复 session 不丢状态 |
| 客户端乐观更新 | 否（除选项点击 UI） | mastery / streak 只信服务端响应 |
| 排序微调方式 | 改提示词重排（plan-preview 反复调用） | 简化交互；AI 始终保证依赖关系 |
| KpPill 上的 % | mastery（跨 session 累积） | 与右侧面板、报告页语义一致 |
| 完成弹窗触发时机 | 用户点「下一题」时 | 不打断阅读解析；节奏可控 |
| 错题重刷出组条件 | 全部答对 | 对齐 PRD §4.5 |
| 多选答案规范化 | 字母去重排序后整串比对 | 用户输入顺序无关 |
| user_mastery 跨 session | 累积，不 reset | 符合"刷题持续进步"心智 |
| per-session per-kp 状态 | 不存表，从 answer_records 实时聚合 | 减少冗余 |
| AI 多轮问答 | 独立 answer_ai_messages 表 | 一题多问的扩展性 |
| mastery 起始快照 | practice_sessions.kpMasterySnapshot 独立列 | 报告 Δ 计算 |
| Plan 页入库时机 | 点「开始刷题」才建 session | 避免堆积空 session |
| 「重新开始」 | AlertDialog 二次确认 + abandon API | 不可逆操作必须确认 |
