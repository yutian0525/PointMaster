# Micro-Learning Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full-stack micro-learning feature that generates personalized learning cards via AI based on knowledge points, example questions, answer records, and error patterns, with a draggable canvas UI and history tracking.

**Architecture:** Independent page route `/micro-learning/[knowledgePointId]` with API routes for AI generation, text-selection Q&A, and history CRUD. Canvas UI uses native pointer events for drag/pan/zoom. AI generates markdown, backend parses into structured cards.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, better-sqlite3 + Drizzle ORM, OpenAI SDK (DeepSeek), SVG for connections, pointer events for drag.

---

## File Structure

```
New files:
  types/micro-learning.ts                          — Type definitions for cards, connections, API payloads
  lib/ai/generate-micro.ts                         — AI prompt + markdown parsing for card generation
  lib/ai/ask-question.ts                           — AI prompt for select-to-ask feature
  app/api/micro-learning/generate/route.ts         — POST: generate cards
  app/api/micro-learning/ask/route.ts              — POST: ask about selected text
  app/api/micro-learning/history/route.ts          — GET: list history records
  app/api/micro-learning/history/[id]/route.ts     — GET: single history detail
  app/api/micro-learning/complete/route.ts         — POST: save completed session
  components/micro-learning/micro-learning-canvas.tsx — Main canvas (viewport + world + pan/zoom)
  components/micro-learning/learning-card.tsx       — Single draggable card
  components/micro-learning/card-connections.tsx    — SVG connection lines
  components/micro-learning/selection-popup.tsx     — Text selection → ask popup
  components/micro-learning/loading-skeleton.tsx    — Skeleton while AI generates
  components/micro-learning/toolbar.tsx            — Top toolbar
  components/micro-learning/history-drawer.tsx     — History records drawer
  app/micro-learning/[knowledgePointId]/page.tsx   — Page component

Modified files:
  lib/db/schema.ts                                 — Add micro_learning_records table
  components/knowledge-graph/node-popup.tsx         — Enable "进入微学习" button with Link
  types/index.ts                                   — Re-export micro-learning types
```

---

### Task 1: Types & Database Schema

**Files:**
- Create: `types/micro-learning.ts`
- Modify: `lib/db/schema.ts`
- Modify: `types/index.ts`

- [ ] **Step 1: Create type definitions**

Create `types/micro-learning.ts`:

```typescript
export type CardType = "concept" | "signal" | "template" | "pitfall" | "example" | "extended";

export interface MicroCard {
  id: string;
  type: CardType;
  title: string;
  content: string;
  importance: "required" | "recommended";
  sourceKeyword?: string;
}

export interface CardConnection {
  from: string;
  to: string;
  label: string;
}

export interface GenerateRequest {
  knowledgePointId: string;
  context?: {
    questions: Array<{
      id: string;
      content: string;
      options: string[];
      answer: string;
      analysis?: string;
    }>;
    answerRecords?: Array<{
      questionId: string;
      userAnswer: string;
      isCorrect: boolean;
      answerTime: number;
    }>;
    errorPatterns?: Array<{
      questionId: string;
      questionContent: string;
      wrongOption: string;
      correctOption: string;
    }>;
  };
}

export interface GenerateResponse {
  cards: MicroCard[];
  connections: CardConnection[];
}

export interface AskRequest {
  knowledgePointId: string;
  selectedText: string;
  sourceCardId: string;
  sourceCardContent: string;
}

export interface AskResponse {
  card: MicroCard;
  connection: CardConnection;
}

export interface MicroLearningRecord {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  bankId: string;
  generatedCards: string;
  extendedCards: string | null;
  context: string | null;
  createdAt: number;
}

export interface HistoryListItem {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  cardCount: number;
  extendedCardCount: number;
  createdAt: number;
}
```

- [ ] **Step 2: Add database table to schema**

Add to the end of `lib/db/schema.ts`:

```typescript
export const microLearningRecords = sqliteTable("micro_learning_records", {
  id: text("id").primaryKey(),
  knowledgePointId: text("knowledge_point_id").notNull(),
  bankId: text("bank_id").notNull(),
  generatedCards: text("generated_cards").notNull(),
  extendedCards: text("extended_cards"),
  context: text("context"),
  createdAt: integer("created_at").notNull(),
});
```

- [ ] **Step 3: Re-export types from index**

Add to `types/index.ts`:

```typescript
export type {
  CardType,
  MicroCard,
  CardConnection,
  GenerateRequest,
  GenerateResponse,
  AskRequest,
  AskResponse,
  MicroLearningRecord,
  HistoryListItem,
} from "./micro-learning";
```

- [ ] **Step 4: Generate and run migration**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: Migration file created in `lib/db/migrations/` and applied to SQLite database.

- [ ] **Step 5: Commit**

```bash
git add types/micro-learning.ts lib/db/schema.ts types/index.ts lib/db/migrations/
git commit -m "feat(micro-learning): add types and database schema for micro_learning_records"
```

---

### Task 2: AI Generation Logic

**Files:**
- Create: `lib/ai/generate-micro.ts`
- Create: `lib/ai/ask-question.ts`

- [ ] **Step 1: Create generate-micro.ts**

Create `lib/ai/generate-micro.ts`:

```typescript
import { getAIClient, getModel } from "./client";
import { v4 as uuid } from "uuid";
import type { MicroCard, CardConnection, GenerateRequest } from "@/types";

const SYSTEM_PROMPT = `你是一位教学设计专家，擅长将知识点拆解为易于理解的微学习卡片。

要求：
- 语言精炼，避免冗余
- 使用 **加粗** 标记关键术语
- 数学公式使用行内文本表达
- 每张卡片内容控制在 100-200 字`;

function buildUserPrompt(
  knowledgePoint: { name: string; description: string | null },
  context?: GenerateRequest["context"]
): string {
  let prompt = `请为以下知识点生成微学习卡片：

### 知识点
名称：${knowledgePoint.name}
描述：${knowledgePoint.description || "无"}
`;

  if (context?.questions?.length) {
    prompt += `\n### 该知识点的例题\n`;
    context.questions.forEach((q, i) => {
      const opts = q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("\n");
      prompt += `\n题目${i + 1}：${q.content}\n${opts}\n答案：${q.answer}\n`;
      if (q.analysis) prompt += `解析：${q.analysis}\n`;
    });
  }

  if (context?.answerRecords?.length) {
    const correct = context.answerRecords.filter((r) => r.isCorrect).length;
    const total = context.answerRecords.length;
    const avgTime = Math.round(
      context.answerRecords.reduce((s, r) => s + r.answerTime, 0) / total
    );
    prompt += `\n### 用户答题情况\n正确率：${correct}/${total}，平均用时：${avgTime}秒\n`;
  }

  if (context?.errorPatterns?.length) {
    prompt += `\n### 用户错误模式\n`;
    context.errorPatterns.forEach((e) => {
      prompt += `- 题目「${e.questionContent}」：选了 ${e.wrongOption}，正确答案是 ${e.correctOption}\n`;
    });
  }

  prompt += `\n请按以下格式生成5类卡片：

## 核心概念
（用最精炼的语言解释核心定义和结论，标记关键术语）

## 识别信号
（列出3-5个"看到__就想到__"的触发信号）

## 解题模板
（给出标准化的解题步骤框架，用编号标注每一步）

## 易错点
（基于用户错误模式指出高频错误，提供反例。若无用户数据则给出通用易错点）

## 例题
（选取1-2道代表性题目，给出完整解题过程）`;

  return prompt;
}

const CARD_TYPE_MAP: Record<string, { type: MicroCard["type"]; importance: MicroCard["importance"] }> = {
  "核心概念": { type: "concept", importance: "required" },
  "识别信号": { type: "signal", importance: "recommended" },
  "解题模板": { type: "template", importance: "required" },
  "易错点": { type: "pitfall", importance: "required" },
  "例题": { type: "example", importance: "recommended" },
};

function parseMarkdownToCards(markdown: string): MicroCard[] {
  const sections = markdown.split(/^## /m).filter(Boolean);
  const cards: MicroCard[] = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const titleLine = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();

    if (!content) continue;

    const matched = Object.entries(CARD_TYPE_MAP).find(([key]) => titleLine.includes(key));
    if (!matched) continue;

    const [, { type, importance }] = matched;
    cards.push({
      id: uuid(),
      type,
      title: titleLine,
      content,
      importance,
    });
  }

  return cards;
}

function buildConnections(cards: MicroCard[]): CardConnection[] {
  const connections: CardConnection[] = [];
  const byType = (t: MicroCard["type"]) => cards.find((c) => c.type === t);

  const concept = byType("concept");
  const template = byType("template");
  const pitfall = byType("pitfall");
  const example = byType("example");
  const signal = byType("signal");

  if (concept && pitfall) {
    connections.push({ from: concept.id, to: pitfall.id, label: "对比说明" });
  }
  if (concept && signal) {
    connections.push({ from: concept.id, to: signal.id, label: "识别依据" });
  }
  if (template && example) {
    connections.push({ from: template.id, to: example.id, label: "模板应用" });
  }
  if (pitfall && example) {
    connections.push({ from: pitfall.id, to: example.id, label: "反例练习" });
  }

  return connections;
}

export async function generateMicroLearning(
  knowledgePoint: { name: string; description: string | null },
  context?: GenerateRequest["context"]
): Promise<{ cards: MicroCard[]; connections: CardConnection[] }> {
  const client = getAIClient();
  const userPrompt = buildUserPrompt(knowledgePoint, context);

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  const markdown = response.choices[0]?.message?.content || "";
  const cards = parseMarkdownToCards(markdown);
  const connections = buildConnections(cards);

  return { cards, connections };
}
```

- [ ] **Step 2: Create ask-question.ts**

Create `lib/ai/ask-question.ts`:

```typescript
import { getAIClient, getModel } from "./client";
import { v4 as uuid } from "uuid";
import type { MicroCard, CardConnection } from "@/types";

export async function askAboutSelection(
  knowledgePointName: string,
  selectedText: string,
  sourceCardId: string,
  sourceCardContent: string
): Promise<{ card: MicroCard; connection: CardConnection }> {
  const client = getAIClient();

  const prompt = `用户在学习「${knowledgePointName}」时，对以下内容中的「${selectedText}」提出了疑问。

来源卡片内容：
${sourceCardContent}

请用简洁清晰的语言解释「${selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如果涉及数学概念，给出简单例子
- 控制在 150 字以内`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位知识辅导老师，擅长用简洁清晰的语言解释概念。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "";
  const cardId = uuid();

  return {
    card: {
      id: cardId,
      type: "extended",
      title: `什么是${selectedText}？`,
      content,
      importance: "recommended",
      sourceKeyword: selectedText,
    },
    connection: {
      from: sourceCardId,
      to: cardId,
      label: "提问延伸",
    },
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit --skipLibCheck
```

Expected: No errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/generate-micro.ts lib/ai/ask-question.ts
git commit -m "feat(micro-learning): add AI generation and ask-question logic"
```

---

### Task 3: API Routes

**Files:**
- Create: `app/api/micro-learning/generate/route.ts`
- Create: `app/api/micro-learning/ask/route.ts`
- Create: `app/api/micro-learning/history/route.ts`
- Create: `app/api/micro-learning/history/[id]/route.ts`
- Create: `app/api/micro-learning/complete/route.ts`

- [ ] **Step 1: Create generate route**

Create `app/api/micro-learning/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints, questions, questionKnowledge } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMicroLearning } from "@/lib/ai/generate-micro";
import type { GenerateRequest } from "@/types";

export async function POST(request: NextRequest) {
  const body: GenerateRequest = await request.json();
  const { knowledgePointId, context } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  let finalContext = context;

  if (!finalContext) {
    const qkLinks = db
      .select({ questionId: questionKnowledge.questionId })
      .from(questionKnowledge)
      .where(eq(questionKnowledge.knowledgePointId, knowledgePointId))
      .all();

    if (qkLinks.length > 0) {
      const questionIds = qkLinks.map((l) => l.questionId);
      const relatedQuestions = db
        .select()
        .from(questions)
        .all()
        .filter((q) => questionIds.includes(q.id))
        .slice(0, 5);

      finalContext = {
        questions: relatedQuestions.map((q) => ({
          id: q.id,
          content: q.content,
          options: JSON.parse(q.options),
          answer: q.answer,
          analysis: q.analysis || undefined,
        })),
      };
    }
  }

  const result = await generateMicroLearning(
    { name: kp.name, description: kp.description },
    finalContext
  );

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Create ask route**

Create `app/api/micro-learning/ask/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { askAboutSelection } from "@/lib/ai/ask-question";
import type { AskRequest } from "@/types";

export async function POST(request: NextRequest) {
  const body: AskRequest = await request.json();
  const { knowledgePointId, selectedText, sourceCardId, sourceCardContent } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  const result = await askAboutSelection(
    kp.name,
    selectedText,
    sourceCardId,
    sourceCardContent
  );

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Create history list route**

Create `app/api/micro-learning/history/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { microLearningRecords, knowledgePoints } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const knowledgePointId = searchParams.get("knowledgePointId");

  if (!knowledgePointId) {
    return NextResponse.json({ error: "knowledgePointId required" }, { status: 400 });
  }

  const records = db
    .select()
    .from(microLearningRecords)
    .where(eq(microLearningRecords.knowledgePointId, knowledgePointId))
    .orderBy(desc(microLearningRecords.createdAt))
    .all();

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  const items = records.map((r) => {
    const cards = JSON.parse(r.generatedCards);
    const extended = r.extendedCards ? JSON.parse(r.extendedCards) : [];
    return {
      id: r.id,
      knowledgePointId: r.knowledgePointId,
      knowledgePointName: kp?.name || "",
      cardCount: cards.cards?.length || 0,
      extendedCardCount: Array.isArray(extended) ? extended.length : 0,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ records: items });
}
```

- [ ] **Step 4: Create history detail route**

Create `app/api/micro-learning/history/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { microLearningRecords, knowledgePoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const record = db
    .select()
    .from(microLearningRecords)
    .where(eq(microLearningRecords.id, id))
    .get();

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, record.knowledgePointId))
    .get();

  const generated = JSON.parse(record.generatedCards);
  const extended = record.extendedCards ? JSON.parse(record.extendedCards) : [];

  return NextResponse.json({
    id: record.id,
    knowledgePointId: record.knowledgePointId,
    knowledgePointName: kp?.name || "",
    cards: generated.cards || [],
    connections: generated.connections || [],
    extendedCards: Array.isArray(extended) ? extended : [],
    context: record.context ? JSON.parse(record.context) : null,
    createdAt: record.createdAt,
  });
}
```

- [ ] **Step 5: Create complete route (save session)**

Create `app/api/micro-learning/complete/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { microLearningRecords, knowledgePoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

interface CompleteRequest {
  knowledgePointId: string;
  cards: unknown[];
  connections: unknown[];
  extendedCards: unknown[];
  context: unknown;
}

export async function POST(request: NextRequest) {
  const body: CompleteRequest = await request.json();
  const { knowledgePointId, cards, connections, extendedCards, context } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  const id = uuid();

  db.insert(microLearningRecords).values({
    id,
    knowledgePointId,
    bankId: kp.bankId,
    generatedCards: JSON.stringify({ cards, connections }),
    extendedCards: extendedCards.length > 0 ? JSON.stringify(extendedCards) : null,
    context: context ? JSON.stringify(context) : null,
    createdAt: Date.now(),
  }).run();

  return NextResponse.json({ id });
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit --skipLibCheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/micro-learning/
git commit -m "feat(micro-learning): add API routes for generate, ask, history, and complete"
```

---

### Task 4: Frontend — Loading Skeleton & Toolbar

**Files:**
- Create: `components/micro-learning/loading-skeleton.tsx`
- Create: `components/micro-learning/toolbar.tsx`

- [ ] **Step 1: Create loading skeleton**

Create `components/micro-learning/loading-skeleton.tsx`:

```tsx
"use client";

export function LoadingSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="flex gap-3 mb-4 justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-[260px] h-[180px] rounded-md bg-white border border-border animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <div className="text-[13px] text-text-muted">AI 正在生成学习卡片…</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create toolbar**

Create `components/micro-learning/toolbar.tsx`:

```tsx
"use client";

interface ToolbarProps {
  knowledgePointName: string;
  cardCount: number;
  onOpenHistory: () => void;
  onComplete: () => void;
  completing: boolean;
}

export function Toolbar({
  knowledgePointName,
  cardCount,
  onOpenHistory,
  onComplete,
  completing,
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
          onClick={onOpenHistory}
          className="px-3 py-1.5 rounded-[9px] bg-background text-text-secondary border border-border-strong text-[12px] font-semibold hover:bg-white hover:text-foreground transition-all"
        >
          历史记录
        </button>
        <button
          onClick={onComplete}
          disabled={completing}
          className="px-3.5 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all disabled:opacity-50"
        >
          {completing ? "保存中…" : "✅ 完成学习"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/micro-learning/loading-skeleton.tsx components/micro-learning/toolbar.tsx
git commit -m "feat(micro-learning): add loading skeleton and toolbar components"
```

---

### Task 5: Frontend — Learning Card Component

**Files:**
- Create: `components/micro-learning/learning-card.tsx`

- [ ] **Step 1: Create learning card component**

Create `components/micro-learning/learning-card.tsx`:

```tsx
"use client";

import { useRef, useCallback } from "react";
import type { CardType } from "@/types";

const CARD_STYLES: Record<CardType, { dotColor: string; label: string; labelColor: string; borderStyle: string }> = {
  concept:  { dotColor: "bg-primary-dark", label: "核心概念", labelColor: "text-primary-dark", borderStyle: "border-solid" },
  signal:   { dotColor: "bg-[#5a8ab8]",   label: "识别信号", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  template: { dotColor: "bg-[#5a8ab8]",   label: "解题模板", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  pitfall:  { dotColor: "bg-[#b85858]",   label: "⚠️ 易错点", labelColor: "text-[#a04040]",   borderStyle: "border-solid" },
  example:  { dotColor: "bg-[#6a8c60]",   label: "典型例题", labelColor: "text-[#4a7040]",    borderStyle: "border-solid" },
  extended: { dotColor: "bg-[#b89040]",   label: "延伸卡片", labelColor: "text-[#a07020]",    borderStyle: "border-dashed" },
};

interface LearningCardProps {
  id: string;
  type: CardType;
  title: string;
  content: string;
  importance: "required" | "recommended";
  sourceKeyword?: string;
  x: number;
  y: number;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onTextSelect: (cardId: string, text: string, rect: DOMRect, cardContent: string) => void;
}

export function LearningCard({
  id,
  type,
  title,
  content,
  importance,
  sourceKeyword,
  x,
  y,
  onDragStart,
  onTextSelect,
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
    if (text.length > 0 && text.length < 30) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onTextSelect(id, text, rect, content);
    }
  }, [id, content, onTextSelect]);

  return (
    <div
      className={`absolute w-[280px] bg-white ${style.borderStyle} border-[1.5px] border-border rounded-md overflow-hidden shadow-sm hover:border-primary-light hover:shadow-md transition-shadow select-none`}
      style={{ left: x, top: y }}
      data-card-id={id}
    >
      {/* Header — drag handle */}
      <div
        className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.dotColor}`} />
        <span className={`text-[10px] font-bold tracking-wider uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        {importance === "required" && (
          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
            必读
          </span>
        )}
        {sourceKeyword && (
          <span className="ml-auto text-[10px] text-text-muted">
            来自「{sourceKeyword}」
          </span>
        )}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="px-3.5 py-3 select-text cursor-text"
        onMouseUp={handleMouseUp}
      >
        <div className="font-display text-[14px] font-semibold text-foreground mb-1.5 tracking-tight">
          {title}
        </div>
        <div
          className="text-[12.5px] leading-[1.7] text-text-secondary whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
      </div>

      {/* Footer */}
      <div className="px-3.5 py-2 bg-background border-t border-border">
        <span className="text-[10px] text-text-muted">💬 选中文字提问</span>
      </div>
    </div>
  );
}

function formatContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/\n/g, "<br>");
}
```

- [ ] **Step 2: Commit**

```bash
git add components/micro-learning/learning-card.tsx
git commit -m "feat(micro-learning): add learning card component with drag and text selection"
```

---

### Task 6: Frontend — Card Connections (SVG)

**Files:**
- Create: `components/micro-learning/card-connections.tsx`

- [ ] **Step 1: Create card connections component**

Create `components/micro-learning/card-connections.tsx`:

```tsx
"use client";

import type { CardConnection, CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CardConnectionsProps {
  connections: CardConnection[];
  cardPositions: CardPosition[];
}

const CONNECTION_COLORS: Record<string, string> = {
  "提问延伸": "#c8aa68",
  "模板应用": "#5a8ab8",
  "识别依据": "#5a8ab8",
};
const DEFAULT_CONNECTION_COLOR = "#9fb997";

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
        <marker id="ml-arrow-blue" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#5a8ab8" />
        </marker>
        <marker id="ml-arrow-orange" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#c8aa68" />
        </marker>
      </defs>

      {connections.map((conn, i) => {
        const from = getCenter(conn.from);
        const to = getCenter(conn.to);
        if (!from || !to) return null;

        const color = CONNECTION_COLORS[conn.label] || DEFAULT_CONNECTION_COLOR;
        const markerId = color === "#c8aa68" ? "ml-arrow-orange" : color === "#5a8ab8" ? "ml-arrow-blue" : "ml-arrow-green";
        const isDashed = conn.label === "提问延伸";
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        return (
          <g key={i}>
            <path
              d={`M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
              stroke={color}
              strokeWidth="1.8"
              strokeOpacity="0.7"
              fill="none"
              strokeDasharray={isDashed ? "6 3" : undefined}
              markerEnd={`url(#${markerId})`}
            />
            <rect
              x={midX - 28}
              y={midY - 10}
              width="56"
              height="18"
              rx="9"
              fill="white"
              stroke={color}
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              fill={color}
              fontSize="10"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              fontWeight="600"
            >
              {conn.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/micro-learning/card-connections.tsx
git commit -m "feat(micro-learning): add SVG card connections component"
```

---

### Task 7: Frontend — Selection Popup

**Files:**
- Create: `components/micro-learning/selection-popup.tsx`

- [ ] **Step 1: Create selection popup component**

Create `components/micro-learning/selection-popup.tsx`:

```tsx
"use client";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  loading: boolean;
  onAsk: () => void;
}

export function SelectionPopup({ visible, x, y, text, loading, onAsk }: SelectionPopupProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed z-[10000] flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-foreground text-white text-[12px] font-medium cursor-pointer shadow-lg whitespace-nowrap"
      style={{ left: x, top: y }}
      onClick={onAsk}
    >
      {loading ? (
        <span>生成中…</span>
      ) : (
        <>
          <span>💬</span>
          <span>对「{text.length > 8 ? text.slice(0, 8) + "…" : text}」提问</span>
        </>
      )}
      {/* Triangle pointer */}
      <div
        className="absolute w-[10px] h-[6px] left-1/2 -translate-x-1/2 -bottom-[5px]"
        style={{
          background: "#1e2822",
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/micro-learning/selection-popup.tsx
git commit -m "feat(micro-learning): add text selection popup component"
```

---

### Task 8: Frontend — History Drawer

**Files:**
- Create: `components/micro-learning/history-drawer.tsx`

- [ ] **Step 1: Create history drawer component**

Create `components/micro-learning/history-drawer.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { HistoryListItem } from "@/types";

interface HistoryDrawerProps {
  open: boolean;
  knowledgePointId: string;
  onClose: () => void;
  onLoadRecord: (recordId: string) => void;
}

export function HistoryDrawer({ open, knowledgePointId, onClose, onLoadRecord }: HistoryDrawerProps) {
  const [records, setRecords] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/micro-learning/history?knowledgePointId=${knowledgePointId}`)
      .then((r) => r.json())
      .then((data) => setRecords(data.records || []))
      .finally(() => setLoading(false));
  }, [open, knowledgePointId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[3000]" onClick={onClose}>
      <div className="absolute inset-0 bg-[rgba(30,40,34,0.2)]" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[360px] bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="font-display text-[16px] font-semibold text-foreground">学习历史</div>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] rounded-full bg-background flex items-center justify-center text-text-muted hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-[13px] text-text-muted text-center py-8">加载中…</div>
          ) : records.length === 0 ? (
            <div className="text-[13px] text-text-muted text-center py-8">暂无历史记录</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {records.map((record) => (
                <button
                  key={record.id}
                  onClick={() => onLoadRecord(record.id)}
                  className="w-full text-left bg-background rounded-md p-3.5 border border-border hover:border-border-strong hover:shadow-sm transition-all"
                >
                  <div className="text-[13px] font-semibold text-foreground mb-1">
                    {record.knowledgePointName}
                  </div>
                  <div className="text-[11.5px] text-text-muted">
                    {record.cardCount} 张基础卡片
                    {record.extendedCardCount > 0 && ` · ${record.extendedCardCount} 张延伸卡片`}
                  </div>
                  <div className="text-[11px] text-text-muted mt-1">
                    {new Date(record.createdAt).toLocaleString("zh-CN")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/micro-learning/history-drawer.tsx
git commit -m "feat(micro-learning): add history drawer component"
```

---

### Task 9: Frontend — Main Canvas Component

**Files:**
- Create: `components/micro-learning/micro-learning-canvas.tsx`

- [ ] **Step 1: Create the main canvas component**

Create `components/micro-learning/micro-learning-canvas.tsx`:

```tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { LearningCard } from "./learning-card";
import { CardConnections } from "./card-connections";
import { SelectionPopup } from "./selection-popup";
import type { MicroCard, CardConnection, CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MicroLearningCanvasProps {
  cards: MicroCard[];
  connections: CardConnection[];
  knowledgePointId: string;
  onCardsChange: (cards: MicroCard[]) => void;
  onConnectionsChange: (connections: CardConnection[]) => void;
}

function computeInitialPositions(cards: MicroCard[]): CardPosition[] {
  const CARD_W = 280;
  const CARD_H = 220;
  const GAP_X = 80;
  const GAP_Y = 60;
  const START_X = 60;
  const START_Y = 40;

  const baseTypes: CardType[] = ["concept", "signal", "template", "pitfall", "example"];
  const baseCards = cards.filter((c) => baseTypes.includes(c.type));
  const extCards = cards.filter((c) => c.type === "extended");

  const positions: CardPosition[] = [];

  // Base cards in 2 columns
  const col1Types: CardType[] = ["concept", "signal", "template"];
  const col2Types: CardType[] = ["pitfall", "example"];

  let col1Y = START_Y;
  let col2Y = START_Y;

  for (const card of baseCards) {
    if (col1Types.includes(card.type)) {
      positions.push({ id: card.id, type: card.type, x: START_X, y: col1Y, width: CARD_W, height: CARD_H });
      col1Y += CARD_H + GAP_Y;
    } else if (col2Types.includes(card.type)) {
      positions.push({ id: card.id, type: card.type, x: START_X + CARD_W + GAP_X, y: col2Y, width: CARD_W, height: CARD_H });
      col2Y += CARD_H + GAP_Y;
    }
  }

  // Extended cards to the right
  const extX = START_X + (CARD_W + GAP_X) * 2;
  let extY = START_Y;
  for (const card of extCards) {
    positions.push({ id: card.id, type: card.type, x: extX, y: extY, width: CARD_W, height: CARD_H });
    extY += CARD_H + GAP_Y;
  }

  return positions;
}

export function MicroLearningCanvas({
  cards,
  connections,
  knowledgePointId,
  onCardsChange,
  onConnectionsChange,
}: MicroLearningCanvasProps) {
  const [positions, setPositions] = useState<CardPosition[]>(() => computeInitialPositions(cards));
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragRef = useRef<{ cardId: string; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Selection popup state
  const [selPopup, setSelPopup] = useState({ visible: false, x: 0, y: 0, text: "", cardId: "", cardContent: "" });
  const [askLoading, setAskLoading] = useState(false);

  // Recompute positions when cards change (new extended cards added)
  useEffect(() => {
    setPositions((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newCards = cards.filter((c) => !existingIds.has(c.id));
      if (newCards.length === 0) return prev;

      const maxX = Math.max(...prev.map((p) => p.x + p.width), 0);
      const newPositions = newCards.map((card, i) => ({
        id: card.id,
        type: card.type,
        x: maxX + 80,
        y: 40 + i * 280,
        width: 280,
        height: 220,
      }));

      return [...prev, ...newPositions];
    });
  }, [cards]);

  // Drag handlers
  const handleDragStart = useCallback((cardId: string, e: React.PointerEvent) => {
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
  }, [positions, scale]);

  // Pan handler
  const handleViewportPointerDown = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) return;
    if ((e.target as HTMLElement).closest("[data-card-id]")) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
  }, [panOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) {
      const worldEl = viewportRef.current?.firstElementChild as HTMLElement;
      if (!worldEl) return;
      const worldRect = worldEl.getBoundingClientRect();

      const newX = (e.clientX - worldRect.left) / scale - dragRef.current.offsetX;
      const newY = (e.clientY - worldRect.top) / scale - dragRef.current.offsetY;

      setPositions((prev) =>
        prev.map((p) => (p.id === dragRef.current!.cardId ? { ...p, x: newX, y: newY } : p))
      );
    } else if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    }
  }, [isPanning, scale]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(2, Math.max(0.3, s + delta)));
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.12));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.12));

  // Text selection
  const handleTextSelect = useCallback((cardId: string, text: string, rect: DOMRect, cardContent: string) => {
    setSelPopup({
      visible: true,
      x: rect.left + rect.width / 2 - 80,
      y: rect.top - 40,
      text,
      cardId,
      cardContent,
    });
  }, []);

  const handleAsk = useCallback(async () => {
    if (askLoading) return;
    setAskLoading(true);

    try {
      const res = await fetch("/api/micro-learning/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointId,
          selectedText: selPopup.text,
          sourceCardId: selPopup.cardId,
          sourceCardContent: selPopup.cardContent,
        }),
      });
      const data = await res.json();

      if (data.card) {
        onCardsChange([...cards, data.card]);
        onConnectionsChange([...connections, data.connection]);
      }
    } finally {
      setAskLoading(false);
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [askLoading, knowledgePointId, selPopup, cards, connections, onCardsChange, onConnectionsChange]);

  // Dismiss selection popup on click elsewhere
  const handleViewportClick = useCallback(() => {
    if (selPopup.visible && !askLoading) {
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [selPopup.visible, askLoading]);

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
        {/* World */}
        <div
          className="absolute w-[2400px] h-[1600px]"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Connections */}
          <CardConnections connections={connections} cardPositions={positions} />

          {/* Cards */}
          {cards.map((card) => {
            const pos = positions.find((p) => p.id === card.id);
            if (!pos) return null;
            return (
              <LearningCard
                key={card.id}
                id={card.id}
                type={card.type}
                title={card.title}
                content={card.content}
                importance={card.importance}
                sourceKeyword={card.sourceKeyword}
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

      {/* Selection popup (rendered outside viewport for fixed positioning) */}
      <SelectionPopup
        visible={selPopup.visible}
        x={selPopup.x}
        y={selPopup.y}
        text={selPopup.text}
        loading={askLoading}
        onAsk={handleAsk}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/micro-learning/micro-learning-canvas.tsx
git commit -m "feat(micro-learning): add main canvas component with pan/zoom/drag"
```

---

### Task 10: Frontend — Page Component

**Files:**
- Create: `app/micro-learning/[knowledgePointId]/page.tsx`

- [ ] **Step 1: Create the page component**

Create `app/micro-learning/[knowledgePointId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toolbar } from "@/components/micro-learning/toolbar";
import { MicroLearningCanvas } from "@/components/micro-learning/micro-learning-canvas";
import { LoadingSkeleton } from "@/components/micro-learning/loading-skeleton";
import { HistoryDrawer } from "@/components/micro-learning/history-drawer";
import type { MicroCard, CardConnection, GenerateRequest } from "@/types";

export default function MicroLearningPage({
  params,
}: {
  params: Promise<{ knowledgePointId: string }>;
}) {
  const { knowledgePointId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cards, setCards] = useState<MicroCard[]>([]);
  const [connections, setConnections] = useState<CardConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgePointName, setKnowledgePointName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [context, setContext] = useState<GenerateRequest["context"] | undefined>(undefined);

  // Generate cards on mount
  useEffect(() => {
    async function generate() {
      setLoading(true);
      setError(null);

      try {
        // Fetch knowledge point name for toolbar display
        const bankId = searchParams.get("bankId");
        const graphRes = await fetch(`/api/banks/${bankId}/graph`);
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          const kp = graphData.nodes?.find((n: { id: string; name: string }) => n.id === knowledgePointId);
          if (kp) setKnowledgePointName(kp.name);
        }

        const body: GenerateRequest = { knowledgePointId, context };

        const res = await fetch("/api/micro-learning/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error("生成失败，请重试");
        }

        const data = await res.json();
        setCards(data.cards || []);
        setConnections(data.connections || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "未知错误");
      } finally {
        setLoading(false);
      }
    }

    generate();
  }, [knowledgePointId, searchParams, context]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      const extendedCards = cards.filter((c) => c.type === "extended");
      await fetch("/api/micro-learning/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointId,
          cards: cards.filter((c) => c.type !== "extended"),
          connections,
          extendedCards,
          context: context || null,
        }),
      });
      const bankId = searchParams.get("bankId");
      router.push(bankId ? `/banks/${bankId}` : "/banks");
    } finally {
      setCompleting(false);
    }
  }, [cards, connections, context, knowledgePointId, router, searchParams]);

  const handleLoadRecord = useCallback(async (recordId: string) => {
    setHistoryOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/micro-learning/history/${recordId}`);
      const data = await res.json();
      setCards([...(data.cards || []), ...(data.extendedCards || [])]);
      setConnections(data.connections || []);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Toolbar
          knowledgePointName={knowledgePointName || "加载中…"}
          cardCount={0}
          onOpenHistory={() => {}}
          onComplete={() => {}}
          completing={false}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Toolbar
          knowledgePointName={knowledgePointName || "微学习"}
          cardCount={0}
          onOpenHistory={() => setHistoryOpen(true)}
          onComplete={() => {}}
          completing={false}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[15px] text-text-secondary mb-3">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[13px] font-semibold"
            >
              重试
            </button>
          </div>
        </div>
        <HistoryDrawer
          open={historyOpen}
          knowledgePointId={knowledgePointId}
          onClose={() => setHistoryOpen(false)}
          onLoadRecord={handleLoadRecord}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        knowledgePointName={knowledgePointName}
        cardCount={cards.length}
        onOpenHistory={() => setHistoryOpen(true)}
        onComplete={handleComplete}
        completing={completing}
      />
      <MicroLearningCanvas
        cards={cards}
        connections={connections}
        knowledgePointId={knowledgePointId}
        onCardsChange={setCards}
        onConnectionsChange={setConnections}
      />
      <HistoryDrawer
        open={historyOpen}
        knowledgePointId={knowledgePointId}
        onClose={() => setHistoryOpen(false)}
        onLoadRecord={handleLoadRecord}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/micro-learning/
git commit -m "feat(micro-learning): add micro-learning page with generation, canvas, and history"
```

---

### Task 11: Connect Entry Point from Knowledge Graph

**Files:**
- Modify: `components/knowledge-graph/node-popup.tsx`

- [ ] **Step 1: Enable the "进入微学习" button**

In `components/knowledge-graph/node-popup.tsx`, replace the disabled button in the footer section with a working Link. The current disabled button (around lines 77-80):

```tsx
<button
  className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold opacity-50 cursor-not-allowed"
  disabled
>
  进入微学习 →
</button>
```

Replace with:

```tsx
<Link
  href={`/micro-learning/${node.id}?bankId=${encodeURIComponent(node.id.split("_")[0] || "")}`}
  className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
>
  进入微学习 →
</Link>
```

Also add the import at the top of the file:

```tsx
import Link from "next/link";
```

Note: The `bankId` needs to come from props. Update `NodePopupProps` to include `bankId`:

```tsx
interface NodePopupProps {
  node: KnowledgePointNode;
  allNodes: KnowledgePointNode[];
  bankId: string;
  onClose: () => void;
}
```

And the Link href becomes:

```tsx
<Link
  href={`/micro-learning/${node.id}?bankId=${bankId}`}
  className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
>
  进入微学习 →
</Link>
```

Also update `graph-view.tsx` to pass `bankId` prop through to `NodePopup`. In `GraphView` component, extract bankId from the `data.nodes[0]` or add it as a prop. Since `GraphViewProps` already has `bankName`, add `bankId`:

In `components/knowledge-graph/graph-view.tsx`, update the interface and NodePopup usage:

```tsx
interface GraphViewProps {
  data: GraphData;
  bankName: string;
  bankId: string;
}

export function GraphView({ data, bankName, bankId }: GraphViewProps) {
  // ...existing code...

  return (
    <>
      {/* ...ReactFlow... */}
      {selectedNode && (
        <NodePopup
          node={selectedNode}
          allNodes={data.nodes}
          bankId={bankId}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
}
```

Then find where `GraphView` is rendered in `components/banks/bank-detail-client.tsx` (or wherever it's used) and pass `bankId` prop.

- [ ] **Step 2: Verify the page renders**

Run:
```bash
npm run dev
```

Navigate to a bank detail page, click a knowledge graph node, verify the "进入微学习" button is now a link that navigates to `/micro-learning/[kpId]?bankId=[bankId]`.

- [ ] **Step 3: Commit**

```bash
git add components/knowledge-graph/node-popup.tsx components/knowledge-graph/graph-view.tsx
git commit -m "feat(micro-learning): enable 进入微学习 link from knowledge graph node popup"
```

---

### Task 12: Integration Test — Full Flow

- [ ] **Step 1: Start dev server and test the full flow**

Run:
```bash
npm run dev
```

Test sequence:
1. Navigate to `/banks` → click a bank with completed processing → open bank detail
2. Click a knowledge graph node → popup opens → click "进入微学习"
3. Verify: page navigates to `/micro-learning/[kpId]?bankId=[bankId]`
4. Verify: loading skeleton shows while AI generates
5. Verify: cards appear on canvas after generation completes
6. Verify: cards can be dragged by their header
7. Verify: canvas can be panned (click+drag on empty space)
8. Verify: zoom with scroll wheel and +/- buttons works
9. Select text inside a card body → verify popup appears → click "提问"
10. Verify: extended card appears on canvas with dashed border
11. Click "历史记录" → drawer opens (empty on first use)
12. Click "完成学习" → verify saves and navigates back

- [ ] **Step 2: Fix any issues found during testing**

Address any TypeScript errors, layout issues, or runtime errors discovered.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix(micro-learning): address integration testing issues"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Types & DB Schema | `types/micro-learning.ts`, `lib/db/schema.ts` |
| 2 | AI Generation Logic | `lib/ai/generate-micro.ts`, `lib/ai/ask-question.ts` |
| 3 | API Routes | `app/api/micro-learning/*/route.ts` |
| 4 | Toolbar & Skeleton | `components/micro-learning/toolbar.tsx`, `loading-skeleton.tsx` |
| 5 | Learning Card | `components/micro-learning/learning-card.tsx` |
| 6 | SVG Connections | `components/micro-learning/card-connections.tsx` |
| 7 | Selection Popup | `components/micro-learning/selection-popup.tsx` |
| 8 | History Drawer | `components/micro-learning/history-drawer.tsx` |
| 9 | Main Canvas | `components/micro-learning/micro-learning-canvas.tsx` |
| 10 | Page Component | `app/micro-learning/[knowledgePointId]/page.tsx` |
| 11 | Entry Point Link | `components/knowledge-graph/node-popup.tsx` |
| 12 | Integration Test | Manual E2E verification |
