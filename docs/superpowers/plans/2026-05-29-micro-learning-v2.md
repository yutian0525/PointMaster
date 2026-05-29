# 微学习 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微学习从 V1 的「5 类卡片」重构为 V2 的「知识点详解 + 例题分析」独立实体，与题库/Session 解耦，支持 KP 触发、Session-Agent 触发、题库列表三个入口。

**Architecture:** 新建独立表 `micro_learnings`（drop V1 表），单次 LLM JSON Mode 输出详解 + 例题分析；前端保留 Canvas 形态，重做 3 类卡片（detail / example / extended）。无测试框架，使用 `npx tsc --noEmit --skipLibCheck` 做类型检查 + 手动 E2E 验证。

**Tech Stack:** Next.js 15 (App Router) + TypeScript 5 + better-sqlite3 + Drizzle ORM + OpenAI SDK (DeepSeek 后端) + Tailwind CSS v3 + shadcn/ui

**Spec Reference:** [docs/superpowers/specs/2026-05-29-micro-learning-v2-design.md](../specs/2026-05-29-micro-learning-v2-design.md)

---

## Task 1：DB Schema 与基础类型重建

**Files:**
- Modify: `lib/db/schema.ts`（drop `microLearningRecords`，新增 `microLearnings`）
- Modify: `types/micro-learning.ts`（完全重写）
- Modify: `types/index.ts`（重新导出）
- Create: `lib/db/migrations/0002_micro_learning_v2.sql`（drizzle-kit 生成）

- [ ] **Step 1: 删除 V1 microLearningRecords 表定义**

打开 [lib/db/schema.ts](../../../lib/db/schema.ts)，删除文件末尾 `microLearningRecords` 定义（第 48-56 行）。

- [ ] **Step 2: 添加 V2 microLearnings 表定义**

在 [lib/db/schema.ts](../../../lib/db/schema.ts) 末尾追加：

```typescript
export const microLearnings = sqliteTable("micro_learnings", {
  id: text("id").primaryKey(),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  sessionId: text("session_id"),
  focusHint: text("focus_hint"),
  detailedExplanation: text("detailed_explanation").notNull(),
  exampleAnalyses: text("example_analyses").notNull(),
  extendedCards: text("extended_cards"),
  sourceQuestionIds: text("source_question_ids"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 3: 重写 types/micro-learning.ts**

完全替换 [types/micro-learning.ts](../../../types/micro-learning.ts) 内容为：

```typescript
export type CardType = "detail" | "example" | "extended";

export interface ExampleAnalysis {
  questionId: string;
  content: string;
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
  analysis: string;
}

export interface ExtendedCard {
  id: string;
  type: "extended";
  title: string;
  content: string;
  sourceCardId: string;
  sourceKeyword: string;
  createdAt: number;
}

export interface MicroLearningRecord {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  bankId: string;
  sessionId: string | null;
  focusHint: string | null;
  detailedExplanation: string;
  exampleAnalyses: ExampleAnalysis[];
  extendedCards: ExtendedCard[];
  sourceQuestionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MicroLearningListItem {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  sessionId: string | null;
  exampleCount: number;
  extendedCardCount: number;
  createdAt: number;
}

export interface MicroCard {
  id: string;
  type: CardType;
  title: string;
  content: string;
  questionId?: string;
  questionMeta?: {
    options: string[];
    answer: string;
    userAnswer?: string;
    isWrong?: boolean;
  };
  sourceCardId?: string;
  sourceKeyword?: string;
}

export interface CreateMicroLearningRequest {
  knowledgePointId: string;
  sessionId?: string;
  focusHint?: string;
}

export interface AskRequest {
  selectedText: string;
  sourceCardId: string;
  sourceCardContent: string;
}

export interface RetryExampleRequest {
  questionId: string;
}
```

- [ ] **Step 4: 更新 types/index.ts 重新导出**

替换 [types/index.ts](../../../types/index.ts) 第 28-39 行（`export type {` 块）为：

```typescript
export type {
  CardType,
  MicroCard,
  ExampleAnalysis,
  ExtendedCard,
  MicroLearningRecord,
  MicroLearningListItem,
  CreateMicroLearningRequest,
  AskRequest,
  RetryExampleRequest,
} from "./micro-learning";
```

- [ ] **Step 5: 类型检查（应有大量错误，确认 schema 改动生效）**

```bash
npx tsc --noEmit --skipLibCheck
```

预期：报错涉及旧 `microLearningRecords` 引用（API 路由、组件、generate-micro.ts、ask-question.ts），这是预期内的，后续任务会清除。**重点确认 `lib/db/schema.ts` 与 `types/micro-learning.ts` 自身无错。**

- [ ] **Step 6: 生成迁移 SQL**

```bash
npx drizzle-kit generate
```

预期生成 `lib/db/migrations/0002_*.sql`，应包含 `DROP TABLE micro_learning_records` 与 `CREATE TABLE micro_learnings`。检查文件确认内容正确。

- [ ] **Step 7: 执行迁移**

```bash
npx drizzle-kit migrate
```

预期：迁移成功。可用 `npx drizzle-kit studio` 在浏览器确认 `micro_learnings` 表已建、`micro_learning_records` 已删除。

- [ ] **Step 8: 提交**

```bash
git add lib/db/schema.ts lib/db/migrations/ types/micro-learning.ts types/index.ts
git commit -m "feat(micro-learning): rebuild schema and types for V2 (detail + examples)"
```

---

## Task 2：AI 生成核心 — 详解 + 例题分析（JSON Mode）

**Files:**
- Modify: `lib/ai/generate-micro.ts`（完全重写）
- Modify: `lib/ai/ask-question.ts`（精简返回值）

- [ ] **Step 1: 重写 lib/ai/generate-micro.ts**

完全替换 [lib/ai/generate-micro.ts](../../../lib/ai/generate-micro.ts) 内容为：

```typescript
import { getAIClient, getModel } from "./client";
import type { ExampleAnalysis } from "@/types/micro-learning";

interface ExampleInput {
  questionId: string;
  content: string;
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
}

interface GenerateInput {
  knowledgePointName: string;
  knowledgePointDescription: string | null;
  focusHint: string | null;
  examples: ExampleInput[];
}

interface AIRawResult {
  detailed_explanation: string;
  example_analyses: Array<{ questionId: string; analysis: string }>;
}

const SYSTEM_PROMPT = `你是一位教学设计专家，针对指定知识点给学生做一对一辅导。
输出严格遵循 JSON 格式，不要包裹 markdown 代码块。`;

function buildUserPrompt(input: GenerateInput): string {
  let prompt = `请为知识点「${input.knowledgePointName}」生成微学习内容。\n\n### 知识点描述\n${input.knowledgePointDescription || "无"}\n\n### 用户薄弱表现\n${input.focusHint || "用户希望系统学习此知识点"}\n\n### 例题与用户作答情况\n`;

  input.examples.forEach((ex, i) => {
    const opts = ex.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("  ");
    prompt += `\n题目${i + 1}（id: ${ex.questionId}）：${ex.content}\n选项：${opts}\n标准答案：${ex.answer}\n`;
    if (ex.userAnswer !== undefined) {
      prompt += `用户作答：${ex.userAnswer}（${ex.isWrong ? "答错" : "答对"}）\n`;
    }
  });

  prompt += `\n### 输出格式（严格 JSON，不要 markdown 包裹）
{
  "detailed_explanation": "Markdown 文本：按子标题组织（## 定义 / ## 原理 / ## 适用场景 / ## 常见误区 / ## 学习建议），500-1000 字",
  "example_analyses": [
    {
      "questionId": "必须与上面例题 id 严格对应",
      "analysis": "Markdown 文本：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源；200-400 字"
    }
  ]
}`;

  return prompt;
}

async function callLLMOnce(input: GenerateInput): Promise<AIRawResult> {
  const client = getAIClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(raw);
  if (typeof parsed.detailed_explanation !== "string") {
    throw new Error("missing detailed_explanation");
  }
  if (!Array.isArray(parsed.example_analyses)) {
    throw new Error("missing example_analyses");
  }
  return parsed as AIRawResult;
}

export async function generateMicroLearning(
  input: GenerateInput
): Promise<{ detailedExplanation: string; exampleAnalyses: ExampleAnalysis[] }> {
  let raw: AIRawResult;
  try {
    raw = await callLLMOnce(input);
  } catch (err) {
    console.warn("[micro-learning] first attempt failed, retrying once", err);
    raw = await callLLMOnce(input);
  }

  const analysisMap = new Map<string, string>();
  for (const item of raw.example_analyses) {
    if (item && typeof item.questionId === "string") {
      analysisMap.set(item.questionId, typeof item.analysis === "string" ? item.analysis : "");
    }
  }

  const exampleAnalyses: ExampleAnalysis[] = input.examples.map((ex) => ({
    questionId: ex.questionId,
    content: ex.content,
    options: ex.options,
    answer: ex.answer,
    userAnswer: ex.userAnswer,
    isWrong: ex.isWrong,
    analysis: analysisMap.get(ex.questionId) ?? "",
  }));

  return {
    detailedExplanation: raw.detailed_explanation,
    exampleAnalyses,
  };
}

export async function regenerateExampleAnalysis(
  knowledgePointName: string,
  example: ExampleInput
): Promise<string> {
  const client = getAIClient();
  const opts = example.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("  ");
  const userPart = example.userAnswer !== undefined
    ? `用户作答：${example.userAnswer}（${example.isWrong ? "答错" : "答对"}）\n`
    : "";

  const prompt = `知识点：${knowledgePointName}

题目：${example.content}
选项：${opts}
标准答案：${example.answer}
${userPart}
请输出该题的解题分析（Markdown 格式，200-400 字）：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源。直接输出分析正文，不要任何前缀或代码块。`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位教学设计专家，按要求生成简洁清晰的解题分析。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
```

- [ ] **Step 2: 精简 lib/ai/ask-question.ts**

完全替换 [lib/ai/ask-question.ts](../../../lib/ai/ask-question.ts) 内容为：

```typescript
import { getAIClient, getModel } from "./client";

export async function askAboutSelection(
  knowledgePointName: string,
  selectedText: string,
  sourceCardContent: string
): Promise<string> {
  const client = getAIClient();

  const prompt = `用户在学习「${knowledgePointName}」时，对以下内容中的「${selectedText}」提出了疑问。

来源卡片内容：
${sourceCardContent}

请用简洁清晰的语言解释「${selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如有数学概念给出简单例子
- 控制在 150 字以内
- 直接输出解答正文（Markdown），不要任何前缀或代码块`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位知识辅导老师，针对学生选中的术语做精炼解释。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
```

- [ ] **Step 3: 类型检查 — 仅看 ai 目录**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "lib/ai/(generate-micro|ask-question)\.ts"
```

预期：无错误（其他文件错误暂不处理）。如果有错说明 ai 模块自身类型不通，需修复。

- [ ] **Step 4: 提交**

```bash
git add lib/ai/generate-micro.ts lib/ai/ask-question.ts
git commit -m "feat(micro-learning): rewrite AI generation with JSON Mode + retry"
```

---

## Task 3：清除旧 API 路由（先 delete，后续逐步建新）

**Files:**
- Delete: `app/api/micro-learning/generate/`
- Delete: `app/api/micro-learning/complete/`
- Delete: `app/api/micro-learning/history/`
- Delete: `app/api/micro-learning/ask/`

> 这些旧路由直接引用 V1 表 / V1 类型，不删它们后面 tsc 永远不通。先删干净，新路由在 Task 4 建立。

- [ ] **Step 1: 删除旧 API 目录**

```bash
rm -rf app/api/micro-learning/generate app/api/micro-learning/complete app/api/micro-learning/history app/api/micro-learning/ask
```

- [ ] **Step 2: 验证目录已空（除将来要建的）**

```bash
ls app/api/micro-learning/
```

预期：空目录。

- [ ] **Step 3: 类型检查 — 应只剩前端组件相关错误**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning"
```

预期：无输出。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor(micro-learning): remove V1 API routes"
```

---

## Task 4：新 API — POST/GET `/api/micro-learning`（创建 + 列表）

**Files:**
- Create: `app/api/micro-learning/route.ts`

- [ ] **Step 1: 写 route.ts**

创建 [app/api/micro-learning/route.ts](../../../app/api/micro-learning/route.ts)：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import {
  microLearnings,
  knowledgePoints,
  questions,
  questionKnowledge,
} from "@/lib/db/schema";
import { generateMicroLearning } from "@/lib/ai/generate-micro";
import type {
  ExampleAnalysis,
  MicroLearningRecord,
  MicroLearningListItem,
} from "@/types/micro-learning";

const CreateSchema = z.object({
  knowledgePointId: z.string().min(1),
  sessionId: z.string().optional(),
  focusHint: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { knowledgePointId, sessionId, focusHint } = parsed.data;

  const kpRow = db.select().from(knowledgePoints).where(eq(knowledgePoints.id, knowledgePointId)).get();
  if (!kpRow) {
    return NextResponse.json({ error: "knowledge_point_not_found" }, { status: 404 });
  }

  const linkedQuestions = db
    .select({ q: questions })
    .from(questionKnowledge)
    .innerJoin(questions, eq(questionKnowledge.questionId, questions.id))
    .where(eq(questionKnowledge.knowledgePointId, knowledgePointId))
    .all()
    .map((row) => row.q);

  if (linkedQuestions.length === 0) {
    return NextResponse.json({ error: "no_questions_for_knowledge_point" }, { status: 400 });
  }

  const TARGET_COUNT = 3;
  const wrongQuestions: typeof linkedQuestions = [];
  const wrongAnswerMap = new Map<string, string>();

  // session 触发：从 answer_records 取错题（最多 2 道，按 createdAt 倒序）
  // 暂以空实现保留接口；session 引擎对接后由 practice-flow 模块完成。
  // 见 spec §3 边界与约束 §1。
  // TODO(post-practice-flow): 接入 answer_records 查询。
  void sessionId;

  const remainingPool = linkedQuestions.filter((q) => !wrongQuestions.find((w) => w.id === q.id));
  for (let i = remainingPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingPool[i], remainingPool[j]] = [remainingPool[j], remainingPool[i]];
  }
  const fillCount = Math.max(0, Math.min(TARGET_COUNT, linkedQuestions.length) - wrongQuestions.length);
  const selected = [...wrongQuestions, ...remainingPool.slice(0, fillCount)];

  const examples = selected.map((q) => {
    let parsedOptions: string[] = [];
    try {
      const o = JSON.parse(q.options);
      if (Array.isArray(o)) parsedOptions = o.map(String);
    } catch {
      parsedOptions = [];
    }
    return {
      questionId: q.id,
      content: q.content,
      options: parsedOptions,
      answer: q.answer,
      userAnswer: wrongAnswerMap.get(q.id),
      isWrong: wrongAnswerMap.has(q.id),
    };
  });

  let aiOutput;
  try {
    aiOutput = await generateMicroLearning({
      knowledgePointName: kpRow.name,
      knowledgePointDescription: kpRow.description,
      focusHint: focusHint ?? null,
      examples,
    });
  } catch (err) {
    console.error("[micro-learning] generation failed", err);
    return NextResponse.json({ error: "ai_generation_failed" }, { status: 503 });
  }

  const id = uuid();
  const now = Date.now();

  db.insert(microLearnings).values({
    id,
    knowledgePointId,
    bankId: kpRow.bankId,
    sessionId: sessionId ?? null,
    focusHint: focusHint ?? null,
    detailedExplanation: aiOutput.detailedExplanation,
    exampleAnalyses: JSON.stringify(aiOutput.exampleAnalyses),
    extendedCards: JSON.stringify([]),
    sourceQuestionIds: JSON.stringify(examples.map((e) => e.questionId)),
    createdAt: now,
    updatedAt: now,
  }).run();

  const record: MicroLearningRecord = {
    id,
    knowledgePointId,
    knowledgePointName: kpRow.name,
    bankId: kpRow.bankId,
    sessionId: sessionId ?? null,
    focusHint: focusHint ?? null,
    detailedExplanation: aiOutput.detailedExplanation,
    exampleAnalyses: aiOutput.exampleAnalyses,
    extendedCards: [],
    sourceQuestionIds: examples.map((e) => e.questionId),
    createdAt: now,
    updatedAt: now,
  };

  return NextResponse.json(record, { status: 201 });
}

export async function GET(req: NextRequest) {
  const bankId = req.nextUrl.searchParams.get("bankId");
  if (!bankId) {
    return NextResponse.json({ error: "bankId_required" }, { status: 400 });
  }

  const rows = db
    .select({
      id: microLearnings.id,
      knowledgePointId: microLearnings.knowledgePointId,
      knowledgePointName: knowledgePoints.name,
      sessionId: microLearnings.sessionId,
      exampleAnalyses: microLearnings.exampleAnalyses,
      extendedCards: microLearnings.extendedCards,
      createdAt: microLearnings.createdAt,
    })
    .from(microLearnings)
    .innerJoin(knowledgePoints, eq(microLearnings.knowledgePointId, knowledgePoints.id))
    .where(eq(microLearnings.bankId, bankId))
    .orderBy(desc(microLearnings.createdAt))
    .all();

  const records: MicroLearningListItem[] = rows.map((r) => {
    let exampleCount = 0;
    let extendedCardCount = 0;
    try {
      const ex = JSON.parse(r.exampleAnalyses) as ExampleAnalysis[];
      exampleCount = Array.isArray(ex) ? ex.length : 0;
    } catch {
      exampleCount = 0;
    }
    try {
      if (r.extendedCards) {
        const ec = JSON.parse(r.extendedCards);
        extendedCardCount = Array.isArray(ec) ? ec.length : 0;
      }
    } catch {
      extendedCardCount = 0;
    }
    return {
      id: r.id,
      knowledgePointId: r.knowledgePointId,
      knowledgePointName: r.knowledgePointName,
      sessionId: r.sessionId,
      exampleCount,
      extendedCardCount,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ records });
}
```

> **关于 `sessionId` 错题查询**：本次只做接口契约保留，错题取数留 TODO，待 practice-flow 模块的 session 引擎接通后补上。spec §6.1 已明确「session 端的引擎对接在 practice-flow 模块完成」。手动触发分支随机抽题在本次范围内。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning/route.ts"
```

预期：无错误。

- [ ] **Step 3: 启动 dev 服务并 smoke test**

```bash
npm run dev
```

另开终端测 POST（替换 `<KP_ID>` 为数据库里实际 KP id，可用 drizzle-kit studio 查）：

```bash
curl -X POST http://localhost:3000/api/micro-learning \
  -H "Content-Type: application/json" \
  -d '{"knowledgePointId":"<KP_ID>"}'
```

预期：返回 201 + JSON record，含 `id` / `detailedExplanation`（非空字符串）/ `exampleAnalyses`（数组，1-3 项，每项有 `analysis`）。

如果返回 503，检查 `LLM_API_KEY` 配置；返回 404 检查 KP_ID。

- [ ] **Step 4: smoke test GET**

替换 `<BANK_ID>`：

```bash
curl http://localhost:3000/api/micro-learning?bankId=<BANK_ID>
```

预期：返回 `{"records":[{...刚创建的记录...}]}`。

- [ ] **Step 5: 提交**

```bash
git add app/api/micro-learning/route.ts
git commit -m "feat(micro-learning): add POST/GET /api/micro-learning route"
```

---

## Task 5：新 API — GET `/api/micro-learning/[id]`

**Files:**
- Create: `app/api/micro-learning/[id]/route.ts`

- [ ] **Step 1: 写 route.ts**

创建 [app/api/micro-learning/[id]/route.ts](../../../app/api/micro-learning/[id]/route.ts)：

```typescript
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microLearnings, knowledgePoints } from "@/lib/db/schema";
import type {
  ExampleAnalysis,
  ExtendedCard,
  MicroLearningRecord,
} from "@/types/micro-learning";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const row = db
    .select({
      ml: microLearnings,
      kpName: knowledgePoints.name,
    })
    .from(microLearnings)
    .innerJoin(knowledgePoints, eq(microLearnings.knowledgePointId, knowledgePoints.id))
    .where(eq(microLearnings.id, id))
    .get();

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let exampleAnalyses: ExampleAnalysis[] = [];
  let extendedCards: ExtendedCard[] = [];
  let sourceQuestionIds: string[] = [];

  try {
    const parsed = JSON.parse(row.ml.exampleAnalyses);
    if (Array.isArray(parsed)) exampleAnalyses = parsed;
  } catch {}

  try {
    if (row.ml.extendedCards) {
      const parsed = JSON.parse(row.ml.extendedCards);
      if (Array.isArray(parsed)) extendedCards = parsed;
    }
  } catch {}

  try {
    if (row.ml.sourceQuestionIds) {
      const parsed = JSON.parse(row.ml.sourceQuestionIds);
      if (Array.isArray(parsed)) sourceQuestionIds = parsed.map(String);
    }
  } catch {}

  const record: MicroLearningRecord = {
    id: row.ml.id,
    knowledgePointId: row.ml.knowledgePointId,
    knowledgePointName: row.kpName,
    bankId: row.ml.bankId,
    sessionId: row.ml.sessionId,
    focusHint: row.ml.focusHint,
    detailedExplanation: row.ml.detailedExplanation,
    exampleAnalyses,
    extendedCards,
    sourceQuestionIds,
    createdAt: row.ml.createdAt,
    updatedAt: row.ml.updatedAt,
  };

  return NextResponse.json(record);
}
```

- [ ] **Step 2: 类型检查 + smoke test**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning/\[id\]"
curl http://localhost:3000/api/micro-learning/<RECORD_ID>
```

预期：tsc 无错；curl 返回完整 record。

- [ ] **Step 3: 提交**

```bash
git add app/api/micro-learning/[id]/route.ts
git commit -m "feat(micro-learning): add GET /api/micro-learning/[id]"
```

---

## Task 6：新 API — POST `/api/micro-learning/[id]/ask`

**Files:**
- Create: `app/api/micro-learning/[id]/ask/route.ts`

- [ ] **Step 1: 写 route.ts**

创建 [app/api/micro-learning/[id]/ask/route.ts](../../../app/api/micro-learning/[id]/ask/route.ts)：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { microLearnings, knowledgePoints } from "@/lib/db/schema";
import { askAboutSelection } from "@/lib/ai/ask-question";
import type { ExtendedCard } from "@/types/micro-learning";

const AskSchema = z.object({
  selectedText: z.string().min(1).max(30),
  sourceCardId: z.string().min(1),
  sourceCardContent: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.flatten() }, { status: 400 });
  }

  const row = db
    .select({ ml: microLearnings, kpName: knowledgePoints.name })
    .from(microLearnings)
    .innerJoin(knowledgePoints, eq(microLearnings.knowledgePointId, knowledgePoints.id))
    .where(eq(microLearnings.id, id))
    .get();

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let answer: string;
  try {
    answer = await askAboutSelection(row.kpName, parsed.data.selectedText, parsed.data.sourceCardContent);
  } catch (err) {
    console.error("[micro-learning] ask failed", err);
    return NextResponse.json({ error: "ai_ask_failed" }, { status: 503 });
  }

  if (!answer) {
    return NextResponse.json({ error: "ai_empty_response" }, { status: 503 });
  }

  let existing: ExtendedCard[] = [];
  try {
    if (row.ml.extendedCards) {
      const parsedList = JSON.parse(row.ml.extendedCards);
      if (Array.isArray(parsedList)) existing = parsedList;
    }
  } catch {
    existing = [];
  }

  const newCard: ExtendedCard = {
    id: uuid(),
    type: "extended",
    title: `什么是${parsed.data.selectedText}？`,
    content: answer,
    sourceCardId: parsed.data.sourceCardId,
    sourceKeyword: parsed.data.selectedText,
    createdAt: Date.now(),
  };

  const updated = [...existing, newCard];

  db.update(microLearnings)
    .set({
      extendedCards: JSON.stringify(updated),
      updatedAt: Date.now(),
    })
    .where(eq(microLearnings.id, id))
    .run();

  return NextResponse.json({ card: newCard });
}
```

- [ ] **Step 2: 类型检查 + smoke test**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning/\[id\]/ask"
curl -X POST http://localhost:3000/api/micro-learning/<RECORD_ID>/ask \
  -H "Content-Type: application/json" \
  -d '{"selectedText":"导数","sourceCardId":"detail-<RECORD_ID>","sourceCardContent":"导数表示函数在某点的变化率"}'
```

预期：返回 `{ card: { id, type:"extended", content: "...", sourceKeyword:"导数", ... } }`。再 GET 一次单条记录确认 `extendedCards` 数组多了一项。

- [ ] **Step 3: 提交**

```bash
git add app/api/micro-learning/[id]/ask/route.ts
git commit -m "feat(micro-learning): add POST /api/micro-learning/[id]/ask"
```

---

## Task 7：新 API — POST `/api/micro-learning/[id]/retry-example`

**Files:**
- Create: `app/api/micro-learning/[id]/retry-example/route.ts`

- [ ] **Step 1: 写 route.ts**

创建 [app/api/micro-learning/[id]/retry-example/route.ts](../../../app/api/micro-learning/[id]/retry-example/route.ts)：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microLearnings, knowledgePoints } from "@/lib/db/schema";
import { regenerateExampleAnalysis } from "@/lib/ai/generate-micro";
import type { ExampleAnalysis } from "@/types/micro-learning";

const RetrySchema = z.object({
  questionId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RetrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.flatten() }, { status: 400 });
  }

  const row = db
    .select({ ml: microLearnings, kpName: knowledgePoints.name })
    .from(microLearnings)
    .innerJoin(knowledgePoints, eq(microLearnings.knowledgePointId, knowledgePoints.id))
    .where(eq(microLearnings.id, id))
    .get();

  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let analyses: ExampleAnalysis[] = [];
  try {
    const p = JSON.parse(row.ml.exampleAnalyses);
    if (Array.isArray(p)) analyses = p;
  } catch {
    return NextResponse.json({ error: "corrupted_examples" }, { status: 500 });
  }

  const idx = analyses.findIndex((a) => a.questionId === parsed.data.questionId);
  if (idx < 0) {
    return NextResponse.json({ error: "question_not_in_record" }, { status: 404 });
  }

  const target = analyses[idx];
  let newAnalysis: string;
  try {
    newAnalysis = await regenerateExampleAnalysis(row.kpName, {
      questionId: target.questionId,
      content: target.content,
      options: target.options,
      answer: target.answer,
      userAnswer: target.userAnswer,
      isWrong: target.isWrong,
    });
  } catch (err) {
    console.error("[micro-learning] retry example failed", err);
    return NextResponse.json({ error: "ai_retry_failed" }, { status: 503 });
  }

  if (!newAnalysis) {
    return NextResponse.json({ error: "ai_empty_response" }, { status: 503 });
  }

  analyses[idx] = { ...target, analysis: newAnalysis };

  db.update(microLearnings)
    .set({
      exampleAnalyses: JSON.stringify(analyses),
      updatedAt: Date.now(),
    })
    .where(eq(microLearnings.id, id))
    .run();

  return NextResponse.json({ example: analyses[idx] });
}
```

- [ ] **Step 2: 类型检查 + smoke test**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning/\[id\]/retry-example"
curl -X POST http://localhost:3000/api/micro-learning/<RECORD_ID>/retry-example \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<EXAMPLE_QUESTION_ID>"}'
```

预期：返回 `{ example: { questionId, analysis: "...", ... } }`，analysis 是新生成的内容。

- [ ] **Step 3: 提交**

```bash
git add app/api/micro-learning/[id]/retry-example/route.ts
git commit -m "feat(micro-learning): add POST /api/micro-learning/[id]/retry-example"
```

---

## Task 8：前端组件 — 重写 LearningCard（detail / example / extended）

**Files:**
- Modify: `components/micro-learning/learning-card.tsx`（完全重写）

- [ ] **Step 1: 完全重写 learning-card.tsx**

替换 [components/micro-learning/learning-card.tsx](../../../components/micro-learning/learning-card.tsx) 全部内容为：

```typescript
"use client";

import { useRef, useCallback } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import type { CardType } from "@/types";

const CARD_STYLES: Record<CardType, {
  dotColor: string;
  label: string;
  labelColor: string;
  borderStyle: string;
  width: number;
}> = {
  detail:   { dotColor: "bg-primary-dark", label: "知识点详解", labelColor: "text-primary-dark", borderStyle: "border-solid", width: 320 },
  example:  { dotColor: "bg-[#5a8ab8]",    label: "例题分析",   labelColor: "text-[#3a6898]",    borderStyle: "border-solid", width: 280 },
  extended: { dotColor: "bg-[#b89040]",    label: "延伸",       labelColor: "text-[#a07020]",    borderStyle: "border-dashed", width: 280 },
};

interface ExampleMeta {
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
}

interface LearningCardProps {
  id: string;
  type: CardType;
  title: string;
  content: string;
  questionMeta?: ExampleMeta;
  sourceKeyword?: string;
  questionId?: string;
  x: number;
  y: number;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onTextSelect: (cardId: string, text: string, rect: DOMRect, cardContent: string) => void;
  onRetryExample?: (questionId: string) => void;
  retrying?: boolean;
}

export function LearningCard({
  id,
  type,
  title,
  content,
  questionMeta,
  sourceKeyword,
  questionId,
  x,
  y,
  onDragStart,
  onTextSelect,
  onRetryExample,
  retrying,
}: LearningCardProps) {
  const style = CARD_STYLES[type];
  const bodyRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onDragStart(id, e);
    },
    [id, onDragStart]
  );

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    if (text.length > 0 && text.length <= 30) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onTextSelect(id, text, rect, content);
      }
    }
  }, [id, content, onTextSelect]);

  const isExampleWrong = type === "example" && questionMeta?.isWrong;
  const showRetry = type === "example" && (!content || content.trim() === "") && questionId && onRetryExample;

  return (
    <div
      className={`absolute bg-white ${style.borderStyle} border-[1.5px] ${isExampleWrong ? "border-r-[2px] border-r-[#b85858]" : ""} border-border rounded-md overflow-hidden shadow-sm hover:border-primary-light hover:shadow-md transition-shadow select-none`}
      style={{ left: x, top: y, width: style.width }}
      data-card-id={id}
    >
      <div
        className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.dotColor}`} />
        <span className={`text-[10px] font-bold tracking-wider uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        {sourceKeyword && (
          <span className="ml-auto text-[10px] text-text-muted truncate max-w-[120px]">
            来自「{sourceKeyword}」
          </span>
        )}
      </div>

      <div
        ref={bodyRef}
        className="px-3.5 py-3 select-text cursor-text"
        onMouseUp={handleMouseUp}
      >
        <div className="font-display text-[14px] font-semibold text-foreground mb-1.5 tracking-tight">
          {title}
        </div>

        {type === "example" && questionMeta && (
          <div className="text-[12.5px] leading-[1.6] text-text-secondary mb-2">
            <div
              className="whitespace-pre-wrap mb-1.5"
              dangerouslySetInnerHTML={{ __html: formatContent(content || "") }}
            />
            <div className="my-2 border-t border-border" />
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
              {questionMeta.options.map((o, i) => (
                <div key={i}>
                  <span className="font-semibold text-foreground">{String.fromCharCode(65 + i)}.</span> {o}
                </div>
              ))}
            </div>
            <div className="my-2 border-t border-border" />
            <div className="text-[12px]">
              <span className="text-primary-dark font-semibold">✓ 标准答案：{questionMeta.answer}</span>
              {questionMeta.userAnswer !== undefined && (
                <span className={`ml-3 ${questionMeta.isWrong ? "text-[#b85858]" : "text-text-muted"} font-semibold`}>
                  {questionMeta.isWrong ? "✗ 你的作答" : "✓ 你的作答"}：{questionMeta.userAnswer}
                </span>
              )}
            </div>
          </div>
        )}

        {type === "example" && (
          <div className="my-2 border-t border-border" />
        )}

        {showRetry ? (
          <div className="flex items-center gap-2 py-2">
            <span className="text-[12px] text-[#b85858]">AI 分析缺失</span>
            <button
              onClick={() => questionId && onRetryExample?.(questionId)}
              disabled={retrying}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-primary-dark bg-[rgba(159,185,151,0.12)] hover:bg-[rgba(159,185,151,0.22)] transition-all disabled:opacity-50"
            >
              <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
              {retrying ? "重试中…" : "点击重试"}
            </button>
          </div>
        ) : (
          type === "example" ? (
            <div
              className="text-[12.5px] leading-[1.7] text-text-secondary whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: formatContent(questionMeta ? extractAnalysisFromContent(content) : content),
              }}
            />
          ) : (
            <div
              className="text-[12.5px] leading-[1.7] text-text-secondary whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formatContent(content) }}
            />
          )
        )}
      </div>

      <div className="px-3.5 py-2 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <MessageCircle size={10} />
          选中文字提问
        </span>
      </div>
    </div>
  );
}

function extractAnalysisFromContent(content: string): string {
  return content;
}

function formatContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/^## (.+)$/gm, '<div class="font-display text-[12.5px] font-semibold text-foreground mt-2 mb-1">$1</div>')
    .replace(/\n/g, "<br>");
}
```

> **关于 example 卡正文渲染**：因为我们把题目正文与选项/答案显式渲染了，`content` 参数对 example 来说传入的是 `analysis` 字段（不是题面）。Canvas 那一层会做映射（见 Task 11）。`extractAnalysisFromContent` 这层抽象保留，方便以后调整。

- [ ] **Step 2: 类型检查（仅 learning-card）**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/micro-learning/learning-card.tsx"
```

预期：无错。

- [ ] **Step 3: 提交**

```bash
git add components/micro-learning/learning-card.tsx
git commit -m "feat(micro-learning): rewrite LearningCard for V2 card types"
```

---

## Task 9：前端组件 — 简化 CardConnections

**Files:**
- Modify: `components/micro-learning/card-connections.tsx`

- [ ] **Step 1: 重写 card-connections.tsx**

替换 [components/micro-learning/card-connections.tsx](../../../components/micro-learning/card-connections.tsx) 内容为：

```typescript
"use client";

import type { CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SimpleConnection {
  from: string;
  to: string;
  kind: "apply" | "extend";
}

interface CardConnectionsProps {
  connections: SimpleConnection[];
  cardPositions: CardPosition[];
}

const KIND_STYLE = {
  apply:  { color: "#9fb997", label: "应用",     dashed: false, marker: "ml-arrow-green" },
  extend: { color: "#c8aa68", label: "提问延伸", dashed: true,  marker: "ml-arrow-orange" },
};

export function CardConnections({ connections, cardPositions }: CardConnectionsProps) {
  const getCenter = (cardId: string) => {
    const pos = cardPositions.find((p) => p.id === cardId);
    if (!pos) return null;
    return { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 };
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
      <defs>
        <marker id="ml-arrow-green" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#9fb997" />
        </marker>
        <marker id="ml-arrow-orange" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#c8aa68" />
        </marker>
      </defs>

      {connections.map((conn, i) => {
        const from = getCenter(conn.from);
        const to = getCenter(conn.to);
        if (!from || !to) return null;

        const s = KIND_STYLE[conn.kind];
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        return (
          <g key={`${conn.from}->${conn.to}-${i}`}>
            <path
              d={`M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
              stroke={s.color}
              strokeWidth="1.8"
              strokeOpacity="0.7"
              fill="none"
              strokeDasharray={s.dashed ? "6 3" : undefined}
              markerEnd={`url(#${s.marker})`}
            />
            <rect x={midX - 28} y={midY - 10} width="56" height="18" rx="9" fill="white" stroke={s.color} strokeWidth="1" strokeOpacity="0.5" />
            <text x={midX} y={midY + 4} textAnchor="middle" fill={s.color} fontSize="10" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="600">
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/micro-learning/card-connections.tsx"
git add components/micro-learning/card-connections.tsx
git commit -m "feat(micro-learning): simplify CardConnections to apply/extend kinds"
```

---

## Task 10：前端组件 — 简化 SelectionPopup（不再需要自由问答输入）

**Files:**
- Modify: `components/micro-learning/selection-popup.tsx`

> Spec §5.5 中划词提问改为「直接对选中文字解释」(`什么是${selectedText}？`)，不再让用户输入自由问题。简化 popup：去掉 input、Send，仅保留确认按钮。

- [ ] **Step 1: 重写 selection-popup.tsx**

替换 [components/micro-learning/selection-popup.tsx](../../../components/micro-learning/selection-popup.tsx) 内容为：

```typescript
"use client";

import { MessageCircle, X, Loader2 } from "lucide-react";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function SelectionPopup({
  visible,
  x,
  y,
  selectedText,
  loading,
  onConfirm,
  onClose,
}: SelectionPopupProps) {
  if (!visible) return null;

  const display = selectedText.length > 12 ? selectedText.slice(0, 12) + "…" : selectedText;

  return (
    <div
      className="fixed z-[10000] bg-white rounded-lg shadow-[0_8px_30px_rgba(30,40,34,0.18)] border border-border overflow-hidden"
      style={{ left: Math.max(8, x - 120), top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border min-w-[220px]">
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <MessageCircle size={12} />
          <span>对「{display}」提问</span>
        </div>
        <button
          onClick={onClose}
          disabled={loading}
          className="text-text-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <X size={13} />
        </button>
      </div>
      <button
        onClick={onConfirm}
        disabled={loading}
        className="w-full px-3 py-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-primary-dark hover:bg-[rgba(159,185,151,0.1)] transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            生成中…
          </>
        ) : (
          <>💬 解释「{display}」</>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/micro-learning/selection-popup.tsx"
git add components/micro-learning/selection-popup.tsx
git commit -m "refactor(micro-learning): simplify SelectionPopup for V2 ask flow"
```

---

## Task 11：前端组件 — 重写 MicroLearningCanvas

**Files:**
- Modify: `components/micro-learning/micro-learning-canvas.tsx`（完全重写）

- [ ] **Step 1: 重写 micro-learning-canvas.tsx**

替换 [components/micro-learning/micro-learning-canvas.tsx](../../../components/micro-learning/micro-learning-canvas.tsx) 全部内容为：

```typescript
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { LearningCard } from "./learning-card";
import { CardConnections, type SimpleConnection } from "./card-connections";
import { SelectionPopup } from "./selection-popup";
import type {
  CardType,
  ExampleAnalysis,
  ExtendedCard,
} from "@/types/micro-learning";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MicroLearningCanvasProps {
  recordId: string;
  detailedExplanation: string;
  knowledgePointName: string;
  exampleAnalyses: ExampleAnalysis[];
  extendedCards: ExtendedCard[];
  onAddExtendedCard: (card: ExtendedCard) => void;
  onRetryExample: (questionId: string, newAnalysis: string) => void;
}

const DETAIL_X = 60;
const DETAIL_Y = 40;
const DETAIL_W = 320;
const DETAIL_H = 360;
const EXAMPLE_W = 280;
const EXAMPLE_H = 260;
const EXAMPLE_GAP_Y = 60;
const COL_GAP_X = 100;
const EXTENDED_W = 280;
const EXTENDED_H = 200;

function detailCardId(recordId: string) {
  return `detail-${recordId}`;
}

function exampleCardId(questionId: string) {
  return `example-${questionId}`;
}

function computePositions(
  recordId: string,
  examples: ExampleAnalysis[],
  extended: ExtendedCard[]
): CardPosition[] {
  const positions: CardPosition[] = [];

  positions.push({
    id: detailCardId(recordId),
    type: "detail",
    x: DETAIL_X,
    y: DETAIL_Y,
    width: DETAIL_W,
    height: DETAIL_H,
  });

  const sorted = [...examples].sort((a, b) => Number(b.isWrong ?? false) - Number(a.isWrong ?? false));
  const exampleX = DETAIL_X + DETAIL_W + COL_GAP_X;
  sorted.forEach((ex, i) => {
    positions.push({
      id: exampleCardId(ex.questionId),
      type: "example",
      x: exampleX,
      y: DETAIL_Y + i * (EXAMPLE_H + EXAMPLE_GAP_Y),
      width: EXAMPLE_W,
      height: EXAMPLE_H,
    });
  });

  const extX = exampleX + EXAMPLE_W + COL_GAP_X;
  extended.forEach((ec, i) => {
    positions.push({
      id: ec.id,
      type: "extended",
      x: extX,
      y: DETAIL_Y + i * (EXTENDED_H + EXAMPLE_GAP_Y),
      width: EXTENDED_W,
      height: EXTENDED_H,
    });
  });

  return positions;
}

function buildConnections(
  recordId: string,
  examples: ExampleAnalysis[],
  extended: ExtendedCard[]
): SimpleConnection[] {
  const connections: SimpleConnection[] = [];
  const detail = detailCardId(recordId);

  examples.forEach((ex) => {
    connections.push({ from: detail, to: exampleCardId(ex.questionId), kind: "apply" });
  });

  extended.forEach((ec) => {
    connections.push({ from: ec.sourceCardId, to: ec.id, kind: "extend" });
  });

  return connections;
}

export function MicroLearningCanvas({
  recordId,
  detailedExplanation,
  knowledgePointName,
  exampleAnalyses,
  extendedCards,
  onAddExtendedCard,
  onRetryExample,
}: MicroLearningCanvasProps) {
  const [positions, setPositions] = useState<CardPosition[]>(() =>
    computePositions(recordId, exampleAnalyses, extendedCards)
  );

  // Reflow on data change
  const exampleSig = useMemo(
    () => exampleAnalyses.map((e) => e.questionId).join(","),
    [exampleAnalyses]
  );
  const extendedSig = useMemo(
    () => extendedCards.map((e) => e.id).join(","),
    [extendedCards]
  );

  useEffect(() => {
    setPositions((prev) => {
      const computed = computePositions(recordId, exampleAnalyses, extendedCards);
      const merged = computed.map((c) => {
        const existing = prev.find((p) => p.id === c.id);
        return existing ? { ...c, x: existing.x, y: existing.y } : c;
      });
      return merged;
    });
  }, [recordId, exampleSig, extendedSig, exampleAnalyses, extendedCards]);

  const connections = useMemo(
    () => buildConnections(recordId, exampleAnalyses, extendedCards),
    [recordId, exampleAnalyses, extendedCards]
  );

  // Pan / zoom / drag — same as V1
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragRef = useRef<{ cardId: string; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [selPopup, setSelPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    cardId: "",
    cardContent: "",
  });
  const [askLoading, setAskLoading] = useState(false);
  const [retryingMap, setRetryingMap] = useState<Record<string, boolean>>({});

  const handleDragStart = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      const pos = positions.find((p) => p.id === cardId);
      if (!pos) return;
      const worldEl = viewportRef.current?.firstElementChild as HTMLElement;
      if (!worldEl) return;
      const worldRect = worldEl.getBoundingClientRect();
      dragRef.current = {
        cardId,
        offsetX: (e.clientX - worldRect.left) / scale - pos.x,
        offsetY: (e.clientY - worldRect.top) / scale - pos.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [positions, scale]
  );

  const handleViewportPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) return;
      if ((e.target as HTMLElement).closest("[data-card-id]")) return;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    },
    [panOffset]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const worldEl = viewportRef.current?.firstElementChild as HTMLElement;
        if (!worldEl) return;
        const worldRect = worldEl.getBoundingClientRect();
        const { cardId, offsetX, offsetY } = dragRef.current;
        const newX = (e.clientX - worldRect.left) / scale - offsetX;
        const newY = (e.clientY - worldRect.top) / scale - offsetY;
        setPositions((prev) =>
          prev.map((p) => (p.id === cardId ? { ...p, x: newX, y: newY } : p))
        );
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      }
    },
    [isPanning, scale]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(2, Math.max(0.3, s + delta)));
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.12));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.12));

  const handleTextSelect = useCallback(
    (cardId: string, text: string, rect: DOMRect, cardContent: string) => {
      if (rect.width === 0 && rect.height === 0) return;
      setSelPopup({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
        text,
        cardId,
        cardContent,
      });
    },
    []
  );

  const handleAsk = useCallback(async () => {
    if (askLoading) return;
    setAskLoading(true);
    try {
      const res = await fetch(`/api/micro-learning/${recordId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: selPopup.text,
          sourceCardId: selPopup.cardId,
          sourceCardContent: selPopup.cardContent,
        }),
      });
      if (!res.ok) {
        console.error("[micro-learning] ask failed", await res.text());
        return;
      }
      const data = await res.json();
      if (data.card) {
        onAddExtendedCard(data.card as ExtendedCard);
      }
    } finally {
      setAskLoading(false);
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [askLoading, recordId, selPopup, onAddExtendedCard]);

  const handleClosePopup = useCallback(() => {
    if (!askLoading) setSelPopup((s) => ({ ...s, visible: false }));
  }, [askLoading]);

  const handleViewportClick = useCallback(
    (e: React.MouseEvent) => {
      if (selPopup.visible && !askLoading) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-card-id]")) {
          setSelPopup((s) => ({ ...s, visible: false }));
        }
      }
    },
    [selPopup.visible, askLoading]
  );

  const handleRetry = useCallback(
    async (questionId: string) => {
      if (retryingMap[questionId]) return;
      setRetryingMap((m) => ({ ...m, [questionId]: true }));
      try {
        const res = await fetch(`/api/micro-learning/${recordId}/retry-example`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
        if (!res.ok) {
          console.error("[micro-learning] retry failed", await res.text());
          return;
        }
        const data = await res.json();
        if (data.example?.analysis) {
          onRetryExample(questionId, data.example.analysis);
        }
      } finally {
        setRetryingMap((m) => ({ ...m, [questionId]: false }));
      }
    },
    [recordId, retryingMap, onRetryExample]
  );

  const detailId = detailCardId(recordId);

  return (
    <>
      <div
        ref={viewportRef}
        className={`flex-1 relative overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          backgroundColor: "#f4f2f0",
          backgroundImage: "radial-gradient(circle, rgba(159,185,151,0.3) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleViewportClick}
      >
        <div
          className="absolute w-[2400px] h-[1600px]"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <CardConnections connections={connections} cardPositions={positions} />

          {/* Detail card */}
          {(() => {
            const pos = positions.find((p) => p.id === detailId);
            if (!pos) return null;
            return (
              <LearningCard
                key={detailId}
                id={detailId}
                type="detail"
                title={knowledgePointName}
                content={detailedExplanation}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
              />
            );
          })()}

          {/* Example cards */}
          {exampleAnalyses.map((ex) => {
            const id = exampleCardId(ex.questionId);
            const pos = positions.find((p) => p.id === id);
            if (!pos) return null;
            return (
              <LearningCard
                key={id}
                id={id}
                type="example"
                title={ex.content}
                content={ex.analysis}
                questionId={ex.questionId}
                questionMeta={{
                  options: ex.options,
                  answer: ex.answer,
                  userAnswer: ex.userAnswer,
                  isWrong: ex.isWrong,
                }}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
                onRetryExample={handleRetry}
                retrying={!!retryingMap[ex.questionId]}
              />
            );
          })}

          {/* Extended cards */}
          {extendedCards.map((ec) => {
            const pos = positions.find((p) => p.id === ec.id);
            if (!pos) return null;
            return (
              <LearningCard
                key={ec.id}
                id={ec.id}
                type="extended"
                title={ec.title}
                content={ec.content}
                sourceKeyword={ec.sourceKeyword}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
              />
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1">
          <button onClick={zoomIn} className="w-[30px] h-[30px] rounded-lg bg-white border border-border flex items-center justify-center text-[16px] font-bold text-text-secondary shadow-sm hover:bg-background-alt hover:text-foreground transition-all">
            +
          </button>
          <div className="text-center text-[10.5px] text-text-muted bg-white border border-border rounded-md px-1 py-0.5">
            {Math.round(scale * 100)}%
          </div>
          <button onClick={zoomOut} className="w-[30px] h-[30px] rounded-lg bg-white border border-border flex items-center justify-center text-[16px] font-bold text-text-secondary shadow-sm hover:bg-background-alt hover:text-foreground transition-all">
            −
          </button>
        </div>
      </div>

      <SelectionPopup
        visible={selPopup.visible}
        x={selPopup.x}
        y={selPopup.y}
        selectedText={selPopup.text}
        loading={askLoading}
        onConfirm={handleAsk}
        onClose={handleClosePopup}
      />
    </>
  );
}
```

- [ ] **Step 2: 类型检查（仅 canvas）**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/micro-learning/micro-learning-canvas.tsx"
```

预期：无错。

- [ ] **Step 3: 提交**

```bash
git add components/micro-learning/micro-learning-canvas.tsx
git commit -m "feat(micro-learning): rewrite MicroLearningCanvas for V2 layout"
```

---

## Task 12：前端组件 — 简化 Toolbar（移除保存与历史按钮）

**Files:**
- Modify: `components/micro-learning/toolbar.tsx`

- [ ] **Step 1: 重写 toolbar.tsx**

替换 [components/micro-learning/toolbar.tsx](../../../components/micro-learning/toolbar.tsx) 内容为：

```typescript
"use client";

import { CheckCircle } from "lucide-react";

interface ToolbarProps {
  knowledgePointName: string;
  cardCount: number;
  finishLabel?: string;
  onFinish: () => void;
}

export function Toolbar({
  knowledgePointName,
  cardCount,
  finishLabel = "完成学习",
  onFinish,
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-white flex-shrink-0 gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-background border border-border-strong rounded-full px-3 py-1">
          <div className="w-[7px] h-[7px] rounded-full bg-primary flex-shrink-0" />
          <span className="text-[13px] font-bold text-foreground">{knowledgePointName}</span>
        </div>
        <span className="text-[12px] text-text-muted">
          {cardCount} 张卡片 · 拖动卡片自由排列 · 选中文字可提问
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onFinish}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
        >
          <CheckCircle size={13} />
          {finishLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/micro-learning/toolbar.tsx"
git add components/micro-learning/toolbar.tsx
git commit -m "refactor(micro-learning): simplify Toolbar for V2"
```

---

## Task 13：删除旧前端页面与 history-drawer

**Files:**
- Delete: `app/micro-learning/[knowledgePointId]/`
- Delete: `app/micro-learning/history/`
- Delete: `components/micro-learning/history-drawer.tsx`

- [ ] **Step 1: 删除旧目录与组件**

```bash
rm -rf app/micro-learning/[knowledgePointId] app/micro-learning/history components/micro-learning/history-drawer.tsx
```

- [ ] **Step 2: 检查目录**

```bash
ls app/micro-learning/ components/micro-learning/
```

预期：
- `app/micro-learning/` 为空（即将在 Task 14、15 重建）
- `components/micro-learning/` 仅剩 card-connections.tsx / learning-card.tsx / loading-skeleton.tsx / micro-learning-canvas.tsx / selection-popup.tsx / toolbar.tsx

- [ ] **Step 3: 类型检查 — 应只剩页面缺失相关错误**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -40
```

预期：所有错误集中在还未替换的 `app/micro-learning/...` 引用（其实没了所以应是 0 错误，最多剩 `node-popup.tsx` 链接路径 stale 但 ts 不报这个）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor(micro-learning): remove V1 pages and history-drawer"
```

---

## Task 14：前端页面 — `/micro-learning/new` 创建中转页

**Files:**
- Create: `app/micro-learning/new/page.tsx`

- [ ] **Step 1: 写 new page.tsx**

创建 [app/micro-learning/new/page.tsx](../../../app/micro-learning/new/page.tsx)：

```typescript
"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MicroLearningNewPage() {
  const router = useRouter();
  const search = useSearchParams();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const kpId = search.get("kpId");
    const sessionId = search.get("sessionId");
    const focusHint = search.get("focusHint");
    const returnTo = search.get("returnTo");

    if (!kpId) {
      router.replace("/");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/micro-learning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgePointId: kpId,
            sessionId: sessionId ?? undefined,
            focusHint: focusHint ?? undefined,
          }),
        });
        if (!res.ok) {
          console.error("[micro-learning new] create failed", await res.text());
          alert("微学习生成失败，请稍后重试。");
          router.back();
          return;
        }
        const data = await res.json();
        if (!data?.id) {
          alert("微学习生成失败：响应缺少 id。");
          router.back();
          return;
        }
        const target = returnTo
          ? `/micro-learning/${data.id}?returnTo=${encodeURIComponent(returnTo)}`
          : `/micro-learning/${data.id}`;
        router.replace(target);
      } catch (err) {
        console.error("[micro-learning new] error", err);
        alert("微学习生成失败，请检查网络。");
        router.back();
      }
    })();
  }, [router, search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-text-secondary">
        <Loader2 className="animate-spin text-primary-dark" size={28} />
        <div className="text-[14px] font-semibold text-foreground">AI 正在生成学习卡片…</div>
        <div className="text-[12px] text-text-muted">通常需要 6-12 秒，请稍候</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/micro-learning/new"
git add app/micro-learning/new/page.tsx
git commit -m "feat(micro-learning): add /micro-learning/new transit page"
```

---

## Task 15：前端页面 — `/micro-learning/[id]` 详情页

**Files:**
- Create: `app/micro-learning/[id]/page.tsx`

- [ ] **Step 1: 写详情页**

创建 [app/micro-learning/[id]/page.tsx](../../../app/micro-learning/[id]/page.tsx)：

```typescript
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MicroLearningCanvas } from "@/components/micro-learning/micro-learning-canvas";
import { Toolbar } from "@/components/micro-learning/toolbar";
import type {
  ExampleAnalysis,
  ExtendedCard,
  MicroLearningRecord,
} from "@/types/micro-learning";

export default function MicroLearningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = search.get("returnTo");

  const [record, setRecord] = useState<MicroLearningRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/micro-learning/${id}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "记录不存在" : "加载失败");
          return;
        }
        const data: MicroLearningRecord = await res.json();
        if (!cancelled) setRecord(data);
      } catch (err) {
        console.error("[micro-learning detail] load failed", err);
        if (!cancelled) setError("加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddExtendedCard = useCallback((card: ExtendedCard) => {
    setRecord((prev) =>
      prev ? { ...prev, extendedCards: [...prev.extendedCards, card] } : prev
    );
  }, []);

  const handleRetryExample = useCallback((questionId: string, newAnalysis: string) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const updated: ExampleAnalysis[] = prev.exampleAnalyses.map((ex) =>
        ex.questionId === questionId ? { ...ex, analysis: newAnalysis } : ex
      );
      return { ...prev, exampleAnalyses: updated };
    });
  }, []);

  const handleFinish = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (record) {
      router.push(`/banks/${record.bankId}`);
      return;
    }
    router.push("/");
  }, [returnTo, record, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-text-secondary text-[14px]">{error}</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-primary-dark" size={24} />
          <div className="text-[12.5px] text-text-muted">加载中…</div>
        </div>
      </div>
    );
  }

  const cardCount = 1 + record.exampleAnalyses.length + record.extendedCards.length;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Toolbar
        knowledgePointName={record.knowledgePointName}
        cardCount={cardCount}
        finishLabel={returnTo ? "学完了，继续练习" : "完成学习"}
        onFinish={handleFinish}
      />
      <MicroLearningCanvas
        recordId={record.id}
        detailedExplanation={record.detailedExplanation}
        knowledgePointName={record.knowledgePointName}
        exampleAnalyses={record.exampleAnalyses}
        extendedCards={record.extendedCards}
        onAddExtendedCard={handleAddExtendedCard}
        onRetryExample={handleRetryExample}
      />
    </div>
  );
}
```

- [ ] **Step 2: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/micro-learning/\[id\]"
git add app/micro-learning/[id]/page.tsx
git commit -m "feat(micro-learning): add /micro-learning/[id] detail page"
```

---

## Task 16：题库详情页·微学习列表面板

**Files:**
- Create: `components/banks/micro-learning-list-panel.tsx`
- Modify: `components/banks/bank-detail-client.tsx`

- [ ] **Step 1: 写 MicroLearningListPanel**

创建 [components/banks/micro-learning-list-panel.tsx](../../../components/banks/micro-learning-list-panel.tsx)：

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, BookOpen, MessageCircle, RotateCcw } from "lucide-react";
import type { MicroLearningListItem } from "@/types/micro-learning";

interface MicroLearningListPanelProps {
  bankId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MicroLearningListPanel({ bankId }: MicroLearningListPanelProps) {
  const [open, setOpen] = useState(true);
  const [records, setRecords] = useState<MicroLearningListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/micro-learning?bankId=${encodeURIComponent(bankId)}`);
      if (!res.ok) {
        setRecords([]);
        return;
      }
      const data = await res.json();
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (err) {
      console.error("[micro-learning panel] load failed", err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="mt-5 bg-white border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-[18px] py-3 flex items-center justify-between hover:bg-background transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-primary-dark" />
          <span className="font-display text-[14px] font-semibold text-foreground">
            微学习记录{records ? ` (${records.length})` : ""}
          </span>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-text-muted" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          {loading && !records ? (
            <div className="px-[18px] py-6 text-center text-[12.5px] text-text-muted">加载中…</div>
          ) : records && records.length === 0 ? (
            <div className="px-[18px] py-6 text-center text-[12.5px] text-text-muted">
              该题库还没有微学习记录，可从知识点入口开始
            </div>
          ) : (
            <div>
              {records?.map((r) => (
                <div
                  key={r.id}
                  className="px-[18px] py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 hover:bg-background transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {r.knowledgePointName}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-muted mt-0.5">
                      <span>{r.sessionId ? "Session 触发" : "手动"}</span>
                      <span>{r.exampleCount} 道例题</span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={10} />
                        {r.extendedCardCount}
                      </span>
                      <span>{formatTime(r.createdAt)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/micro-learning/${r.id}`}
                    className="px-2.5 py-1 rounded-md bg-background text-text-secondary text-[11.5px] font-semibold hover:bg-white hover:text-foreground transition-all border border-border"
                  >
                    查看
                  </Link>
                  <Link
                    href={`/micro-learning/new?kpId=${r.knowledgePointId}&bankId=${bankId}`}
                    className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-primary-dark bg-[rgba(159,185,151,0.14)] hover:bg-[rgba(159,185,151,0.24)] transition-all flex items-center gap-1"
                  >
                    <RotateCcw size={11} />
                    重新学习
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 在 bank-detail-client.tsx 中嵌入面板**

打开 [components/banks/bank-detail-client.tsx](../../../components/banks/bank-detail-client.tsx)。

在 import 区追加：

```typescript
import { MicroLearningListPanel } from "./micro-learning-list-panel";
```

定位到 `bank.status === "completed"` 渲染图谱的 div（第 162-189 行附近，外层 `<div className="mt-5">`），在该 div 紧跟下方追加面板。具体改动：

把第 188 行附近的 `</div>` 后面（即 `mt-5` 整块结束之后），新增渲染：

```tsx
{bank.status === "completed" && (
  <MicroLearningListPanel bankId={bankId} />
)}
```

完整位置参考（替换 187-189 行的代码块）：

```tsx
          <div className="mt-2.5 text-[11.5px] text-text-muted">
            → 点击任意节点可查看知识点详情及例题 · 箭头方向 = 学习依赖关系
          </div>
        </div>
      )}

      {bank.status === "completed" && (
        <MicroLearningListPanel bankId={bankId} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 类型检查 + 提交**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "components/banks/"
git add components/banks/micro-learning-list-panel.tsx components/banks/bank-detail-client.tsx
git commit -m "feat(micro-learning): add list panel to bank detail page"
```

---

## Task 17：更新知识图谱节点弹窗的「进入微学习」链接

**Files:**
- Modify: `components/knowledge-graph/node-popup.tsx`

- [ ] **Step 1: 改链接**

在 [components/knowledge-graph/node-popup.tsx](../../../components/knowledge-graph/node-popup.tsx) 第 79-83 行，把 `<Link href={...}>` 的 href 改为：

```tsx
<Link
  href={`/micro-learning/new?kpId=${node.id}&bankId=${bankId}`}
  className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
>
  进入微学习 →
</Link>
```

- [ ] **Step 2: 全量类型检查 — 应已 0 错**

```bash
npx tsc --noEmit --skipLibCheck
```

预期：无任何错误。

- [ ] **Step 3: 提交**

```bash
git add components/knowledge-graph/node-popup.tsx
git commit -m "feat(micro-learning): update KP popup link to /micro-learning/new"
```

---

## Task 18：手动 E2E 集成测试

> 没有自动化测试框架，本任务全靠手动验证 spec §6.1 验收要点。请按顺序执行并把结果记到本 task 的 checklist 上。

**Files:**
- 无（仅运行/手动测试）

- [ ] **Step 1: 启动应用**

```bash
npm run dev
```

打开浏览器到 `http://localhost:3000`。

- [ ] **Step 2: 验收点 1 — 从图谱节点入口创建微学习**

1. 进入一个已 completed 的题库详情页
2. 点击图谱中任意节点 → 弹出 NodePopup
3. 点击「进入微学习 →」按钮
4. 确认 URL 变为 `/micro-learning/new?kpId=...&bankId=...`，看到加载页
5. 6-12 秒后 URL 自动跳转到 `/micro-learning/<id>`
6. 画布上有：1 张知识点详解卡（左）+ 2-3 张例题卡（右）
7. 例题卡渲染了题面、A/B/C/D 选项、标准答案、AI 生成的解题分析

✅ 通过条件：可见 1 张 detail + 2-3 张 example，每张都有内容。

- [ ] **Step 3: 验收点 2 — 划词追问**

1. 在详解卡或例题卡正文中**用鼠标选中一段文字**（≤30 字）
2. 选区下方弹出「💬 对「XX」提问」popup
3. 点击「💬 解释「XX」」按钮
4. popup 显示「生成中…」loading
5. 几秒后 popup 关闭，画布右侧出现一张橙色虚线边的延伸卡（标题为「什么是XX？」）
6. 一条虚线橙色箭头从源卡指向延伸卡，label「提问延伸」

✅ 通过条件：延伸卡正确生成 + 出现连线。

- [ ] **Step 4: 验收点 3 — 题库详情页列表面板**

1. 返回到刚刚那个题库的详情页 (`/banks/<id>`)
2. 知识图谱下方应有「微学习记录 (N)」面板
3. 面板里能看到刚才创建的记录：知识点名 / 「手动」标签 / N 道例题 / 1 张延伸卡 / 时间
4. 点击「查看」→ 进入 `/micro-learning/<id>`，画布渲染所有 detail/example/extended 卡（包括刚加的延伸卡）
5. 返回 → 点击「重新学习」→ 进入 new 页 → 等待 → 跳转到一个新的 `/micro-learning/<id2>` 记录
6. 再回题库详情页，面板里现在有 2 条记录

✅ 通过条件：列表更新 + 查看是只读 + 重新学习产生新记录。

- [ ] **Step 5: 验收点 4 — 例题分析重试**

测试需要让某条例题的 analysis 为空。在 `npx drizzle-kit studio` 里直接 UPDATE 一条 micro_learnings 行的 example_analyses JSON，把某项的 analysis 改成空字符串：

1. 改完后刷新对应 `/micro-learning/<id>` 页
2. 那条例题卡上正文区显示「AI 分析缺失」+「点击重试」按钮
3. 点击重试 → 按钮转 spinner → 几秒后 analysis 内容回填、按钮消失

✅ 通过条件：单卡触发重试，其他卡不变。

- [ ] **Step 6: 验收点 5 — sessionId / focusHint 透传**

```bash
curl -X POST http://localhost:3000/api/micro-learning \
  -H "Content-Type: application/json" \
  -d '{"knowledgePointId":"<KP_ID>","sessionId":"test-session","focusHint":"用户在链式法则上反复出错"}'
```

记下返回的 id，用 drizzle-kit studio 查询该行：
- `session_id` 列 = `"test-session"`
- `focus_hint` 列 = `"用户在链式法则上反复出错"`

并访问该记录前端页面，画布渲染正常。

✅ 通过条件：DB 字段写入 + 前端能正常打开。

- [ ] **Step 7: 验收点 6 — returnTo 跳转**

浏览器访问：

```
http://localhost:3000/micro-learning/new?kpId=<KP_ID>&bankId=<BANK_ID>&returnTo=%2Fpractice%2Ftest-session
```

- 等创建完成跳转到 `/micro-learning/<id>?returnTo=%2Fpractice%2Ftest-session`
- 工具栏右侧按钮文案是「学完了，继续练习」（不是「完成学习」）
- 点击该按钮 → URL 变为 `/practice/test-session`（页面会 404，但跳转目标正确即可）

✅ 通过条件：returnTo 透传 + 按钮文案 + 点击跳转目标正确。

- [ ] **Step 8: 全量回归 — 类型检查 + lint + build**

```bash
npx tsc --noEmit --skipLibCheck
npm run lint
npm run build
```

预期：tsc 0 错；lint 无新增 error；build 成功。

- [ ] **Step 9: 提交手动测试结果（仅说明 + checklist 标记，无代码）**

```bash
git commit --allow-empty -m "test(micro-learning): manual E2E verification of V2 acceptance criteria"
```

---

## 附录：spec 已声明的「本次不做」

以下 4 项 **不在本计划范围内**，严禁在计划中加任务：

1. Session-Agent 的端到端集成（仅保留 API 契约）— 见 Task 4 中 `void sessionId` 与 TODO 注释
2. 卡片位置持久化（每次按算法重算）
3. 跨题库 KP 共享
4. 微学习内容编辑、批量重新生成

## 附录：风险与回退

- **AI JSON Mode 偶发失败**：Task 2 已加 1 次重试，仍失败返回 503。前端 `app/micro-learning/new/page.tsx` 的 `alert` 是简单兜底，不需另写错误页。
- **DB 迁移**：Task 1 直接 drop 旧表 + 建新表。开发环境数据可弃，spec §3 明确允许。生产环境本期不涉及。
