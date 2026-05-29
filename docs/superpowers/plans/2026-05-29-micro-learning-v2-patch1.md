# 微学习 V2 Patch 1 — 布局持久化 + 字数收缩 + 提问交互回归

> 基于 V2 实现后的用户反馈：（1）画布布局丢失（V1 有自动保存），（2）AI 内容太长，（3）提问只能解释、不能自定义 + 卡片级提问能力丢失。

**Goal:** 三个增量补丁修复 V2 砍过头的能力，向 V1 看齐但保留 V2 的整体架构。

**Tech Stack:** 与 V2 同。无测试框架，使用 `npx tsc --noEmit --skipLibCheck` + 手动验证。

---

## Patch A：画布布局持久化（DB）

**Files:**
- Modify: `lib/db/schema.ts`（micro_learnings 表加 `card_positions` 列）
- Create: `lib/db/migrations/0003_*.sql`（drizzle-kit 生成）
- Modify: `types/micro-learning.ts`（加 `CardPosition` + `MicroLearningRecord.cardPositions`）
- Create: `app/api/micro-learning/[id]/layout/route.ts`（PATCH）
- Modify: `app/api/micro-learning/[id]/route.ts`（GET 返回 cardPositions）
- Modify: `components/micro-learning/micro-learning-canvas.tsx`（onPositionsChange + debounced PATCH + savedPositions 初始化）
- Modify: `app/micro-learning/[id]/page.tsx`（透传 savedPositions）

### Task A1: schema + types

- [ ] 在 `lib/db/schema.ts` 的 `microLearnings` 表追加列：

```typescript
  cardPositions: text("card_positions"),  // JSON: { id, x, y }[]，可空
```

放在 `extendedCards` 之后、`sourceQuestionIds` 之前（保持视觉顺序与生命周期阶段一致）。

- [ ] 在 `types/micro-learning.ts` 追加：

```typescript
export interface SavedCardPosition {
  id: string;
  x: number;
  y: number;
}
```

并把 `MicroLearningRecord` 加一个字段：

```typescript
  cardPositions: SavedCardPosition[] | null;
```

放在 `extendedCards` 之后、`sourceQuestionIds` 之前。

- [ ] 在 `types/index.ts` 的 re-export 中追加 `SavedCardPosition`。

- [ ] 生成迁移并执行：

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] 类型检查：

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(lib/db/schema|types/micro-learning|types/index)\.ts"
```

预期：无错。

- [ ] 提交：

```bash
git add lib/db/schema.ts lib/db/migrations/ types/micro-learning.ts types/index.ts
git commit -m "feat(micro-learning): add cardPositions column for layout persistence"
```

### Task A2: API 路由读写 cardPositions

- [ ] 修改 `app/api/micro-learning/[id]/route.ts`，让 GET 解析并返回 `cardPositions`：

在现有 `extendedCards` 解析块之后追加（仿照 `extendedCards` 的 try/catch 模式）：

```typescript
  let cardPositions: SavedCardPosition[] | null = null;
  try {
    if (row.ml.cardPositions) {
      const parsed = JSON.parse(row.ml.cardPositions);
      if (Array.isArray(parsed)) {
        cardPositions = parsed
          .filter((p): p is SavedCardPosition =>
            p && typeof p.id === "string" && typeof p.x === "number" && typeof p.y === "number"
          );
      }
    }
  } catch {}
```

import 顶部加 `SavedCardPosition`。

返回的 `record` 对象加字段：

```typescript
    cardPositions,
```

放在 `extendedCards` 之后、`sourceQuestionIds` 之前。

- [ ] 创建 `app/api/micro-learning/[id]/layout/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microLearnings } from "@/lib/db/schema";

const PositionSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
});

const PatchSchema = z.object({
  positions: z.array(PositionSchema).max(100),
});

export async function PATCH(
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = db.select({ id: microLearnings.id }).from(microLearnings).where(eq(microLearnings.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  db.update(microLearnings)
    .set({
      cardPositions: JSON.stringify(parsed.data.positions),
      updatedAt: Date.now(),
    })
    .where(eq(microLearnings.id, id))
    .run();

  return NextResponse.json({ ok: true });
}
```

- [ ] 类型检查 + 提交：

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "app/api/micro-learning/\[id\]"
git add app/api/micro-learning/[id]/route.ts app/api/micro-learning/[id]/layout/route.ts
git commit -m "feat(micro-learning): add PATCH /api/micro-learning/[id]/layout + GET include cardPositions"
```

### Task A3: 前端 — 接收 savedPositions + debounced 持久化

- [ ] 修改 `components/micro-learning/micro-learning-canvas.tsx`：

1. `MicroLearningCanvasProps` 添加：

```typescript
  savedPositions?: SavedCardPosition[] | null;
```

2. `import` 顶部加：

```typescript
import type { CardType, ExampleAnalysis, ExtendedCard, SavedCardPosition } from "@/types/micro-learning";
```

3. `useState` 初始化时若有 `savedPositions` 优先用其 x/y 覆盖 computePositions 的默认值（仿照已有的 useEffect merge 逻辑）：

```typescript
  const [positions, setPositions] = useState<CardPosition[]>(() => {
    const computed = computePositions(recordId, exampleAnalyses, extendedCards);
    if (!savedPositions || savedPositions.length === 0) return computed;
    return computed.map((c) => {
      const saved = savedPositions.find((s) => s.id === c.id);
      return saved ? { ...c, x: saved.x, y: saved.y } : c;
    });
  });
```

4. 添加 debounced 持久化：在组件内部新增

```typescript
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialMountRef = useRef(true);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload: SavedCardPosition[] = positions.map((p) => ({ id: p.id, x: p.x, y: p.y }));
      fetch(`/api/micro-learning/${recordId}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: payload }),
      }).catch((err) => console.error("[micro-learning] save layout failed", err));
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [positions, recordId]);
```

注意：`initialMountRef` 防止首次挂载就 PATCH（首次没改动）。

- [ ] 修改 `app/micro-learning/[id]/page.tsx`：把 `record.cardPositions` 透传给 canvas：

```typescript
        savedPositions={record.cardPositions}
```

放在 `<MicroLearningCanvas>` 的 props 中。

- [ ] 类型检查 + 提交：

```bash
npx tsc --noEmit --skipLibCheck
git add components/micro-learning/micro-learning-canvas.tsx app/micro-learning/[id]/page.tsx
git commit -m "feat(micro-learning): persist canvas layout with debounced PATCH"
```

---

## Patch B：AI 内容字数收缩

**Files:**
- Modify: `lib/ai/generate-micro.ts`（两处 prompt 文案 + system prompt）

### Task B1: 收缩详解 prompt 字数

- [ ] 修改 `lib/ai/generate-micro.ts` 中 `buildUserPrompt` 函数末尾的输出格式片段。把原来的：

```
"detailed_explanation": "Markdown 文本：按子标题组织（## 定义 / ## 原理 / ## 适用场景 / ## 常见误区 / ## 学习建议），500-1000 字",
```

改为：

```
"detailed_explanation": "Markdown 文本：用 ## 子标题组织（定义 / 原理 / 适用场景 / 常见误区 / 学习建议）。每段 1-2 句话直击要点，全文 250-400 字。不要套话、不要重复举例。",
```

把：

```
"analysis": "Markdown 文本：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源；200-400 字"
```

改为：

```
"analysis": "Markdown 文本：直接给关键解题步骤；若用户答错额外指出错误根源。不要审题/解题思路这类无信息量的标题段落。控制在 80-150 字。"
```

并把 SYSTEM_PROMPT 改为：

```
const SYSTEM_PROMPT = `你是教学设计专家，针对指定知识点做一对一辅导。
原则：内容精炼、直击要点，不要套话、不要冗余结构。
输出严格遵循 JSON 格式，不要包裹 markdown 代码块。`;
```

### Task B2: 收缩 regenerateExampleAnalysis prompt 字数

- [ ] 修改 `lib/ai/generate-micro.ts` 中 `regenerateExampleAnalysis` 的 prompt。原来的：

```
请输出该题的解题分析（Markdown 格式，200-400 字）：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源。直接输出分析正文，不要任何前缀或代码块。
```

改为：

```
请输出该题的解题分析（Markdown 格式，80-150 字）：直接给关键解题步骤，若用户答错额外指出错误根源。不要审题/解题思路这类标题段落，不要任何前缀或代码块。
```

- [ ] 类型检查 + 提交：

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "lib/ai/generate-micro.ts"
git add lib/ai/generate-micro.ts
git commit -m "refactor(micro-learning): tighten AI content length (detail 250-400, example 80-150)"
```

---

## Patch C：提问交互回归（自定义问题 + 卡片级提问）

**Files:**
- Modify: `lib/ai/ask-question.ts`（参数 selectedText → question；prompt 回归 V1 风格）
- Modify: `app/api/micro-learning/[id]/ask/route.ts`（schema 字段重命名 + 长度放宽）
- Modify: `components/micro-learning/selection-popup.tsx`（恢复 input + 改 onAsk）
- Modify: `components/micro-learning/learning-card.tsx`（恢复卡片级提问按钮）
- Modify: `components/micro-learning/micro-learning-canvas.tsx`（处理 onAskCard + onAsk 携带用户问题）
- Modify: `types/micro-learning.ts`（AskRequest 字段重命名）

### Task C1: 后端 + 类型

- [ ] 修改 `types/micro-learning.ts` 中 `AskRequest`：

```typescript
export interface AskRequest {
  question: string;       // 用户的问题（默认值或自定义文本）
  selectedText?: string;  // 用户选中的关键词（可空，卡片级提问没有）
  sourceCardId: string;
  sourceCardContent: string;
}
```

- [ ] 修改 `lib/ai/ask-question.ts`：

```typescript
import { getAIClient, getModel } from "./client";

export async function askAboutSelection(
  knowledgePointName: string,
  question: string,
  sourceCardContent: string,
  selectedText?: string
): Promise<string> {
  const client = getAIClient();

  const focusLine = selectedText
    ? `用户选中了「${selectedText}」并提问。`
    : `用户针对该卡片整体提问。`;

  const prompt = `用户在学习「${knowledgePointName}」时，针对以下卡片内容提出了问题。

来源卡片内容：
${sourceCardContent}

${focusLine}
用户的问题：${question}

请直接回答用户的问题：
- 结合卡片内容和知识点上下文
- 如果用户要求出题，就出题并给出答案和解析
- 如果用户要求解释概念，就简洁清晰地解释
- 控制在 200 字以内
- 直接输出回答正文（Markdown），不要任何前缀或代码块`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是知识辅导老师。根据用户的具体问题直接作答，不要固定以「解释概念」的形式回复。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
```

- [ ] 修改 `app/api/micro-learning/[id]/ask/route.ts`：

把 `AskSchema` 改为：

```typescript
const AskSchema = z.object({
  question: z.string().min(1).max(200),
  selectedText: z.string().max(50).optional(),
  sourceCardId: z.string().min(1),
  sourceCardContent: z.string().min(1),
});
```

调用 `askAboutSelection` 改为：

```typescript
    answer = await askAboutSelection(
      row.kpName,
      parsed.data.question,
      parsed.data.sourceCardContent,
      parsed.data.selectedText
    );
```

构造 `ExtendedCard` 的 `title` 改为：

```typescript
  const titleText = parsed.data.selectedText
    ? `关于「${parsed.data.selectedText}」`
    : parsed.data.question.length > 18
    ? parsed.data.question.slice(0, 18) + "…"
    : parsed.data.question;

  const newCard: ExtendedCard = {
    id: uuid(),
    type: "extended",
    title: titleText,
    content: answer,
    sourceCardId: parsed.data.sourceCardId,
    sourceKeyword: parsed.data.selectedText ?? titleText,
    createdAt: Date.now(),
  };
```

- [ ] 类型检查（**会有大量前端错误**，预期）：

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(types|app/api|lib/ai)/.*\.ts" | grep -v "components/"
```

预期：上面三层无错；前端报错延后到 C2/C3 修。

- [ ] 提交：

```bash
git add types/micro-learning.ts lib/ai/ask-question.ts app/api/micro-learning/[id]/ask/route.ts
git commit -m "feat(micro-learning): support custom question (selectedText optional, question required)"
```

### Task C2: SelectionPopup 恢复输入框

- [ ] 完全替换 `components/micro-learning/selection-popup.tsx` 为：

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;       // 选中文字；卡片级提问时为该卡片标题
  isCardLevel: boolean;       // true = 卡片级提问（无选区）；false = 划词提问
  loading: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}

export function SelectionPopup({
  visible,
  x,
  y,
  selectedText,
  isCardLevel,
  loading,
  onAsk,
  onClose,
}: SelectionPopupProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const display = selectedText.length > 14 ? selectedText.slice(0, 14) + "…" : selectedText;
  const placeholder = isCardLevel ? "对该卡片提问…" : `解释「${display}」（可改写问题）`;
  const headerLabel = isCardLevel ? `对「${display}」卡片提问` : `对「${display}」提问`;

  const submit = () => {
    if (loading) return;
    const fallback = isCardLevel ? `请帮我讲讲「${selectedText}」` : `解释「${selectedText}」`;
    const question = input.trim() || fallback;
    onAsk(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed z-[10000] w-[340px] bg-white rounded-lg shadow-[0_8px_30px_rgba(30,40,34,0.18)] border border-border overflow-hidden"
      style={{ left: Math.max(8, x - 170), top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <MessageCircle size={12} />
          <span>{headerLabel}</span>
        </div>
        <button onClick={onClose} disabled={loading} className="text-text-muted hover:text-foreground transition-colors disabled:opacity-50">
          <X size={13} />
        </button>
      </div>
      <div className="px-3 py-2 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          maxLength={200}
          className="flex-1 text-[12.5px] text-foreground placeholder:text-text-muted bg-transparent outline-none"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-[26px] h-[26px] rounded-md bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  );
}
```

### Task C3: LearningCard 恢复卡片级提问按钮

- [ ] 修改 `components/micro-learning/learning-card.tsx`：

1. props 增加：

```typescript
  onAskCard?: (cardId: string, cardContent: string) => void;
```

2. 在卡片底部 footer 区把现有的「选中文字提问」展示改为：

```tsx
      <div className="px-3.5 py-2 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <MessageCircle size={10} />
          选中文字或点击右侧
        </span>
        {onAskCard && (
          <button
            onClick={() => onAskCard(id, content)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-text-secondary hover:text-primary-dark hover:bg-[rgba(159,185,151,0.12)] transition-all"
          >
            <MessageCircle size={10} />
            提问
          </button>
        )}
      </div>
```

### Task C4: MicroLearningCanvas 串联 onAskCard + 携带 question

- [ ] 修改 `components/micro-learning/micro-learning-canvas.tsx`：

1. `selPopup` state 加 `isCardLevel: boolean`：

```typescript
  const [selPopup, setSelPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    cardId: "",
    cardContent: "",
    isCardLevel: false,
  });
```

`handleTextSelect` 内的 `setSelPopup` 调用末尾加 `isCardLevel: false,`。

2. 新增 `handleAskCard`：

```typescript
  const handleAskCard = useCallback(
    (cardId: string, cardContent: string) => {
      const cardEl = viewportRef.current?.querySelector(`[data-card-id="${cardId}"]`);
      if (!cardEl) return;
      const rect = cardEl.getBoundingClientRect();
      // 用卡片标题作为 selectedText 占位（用户在 popup 里可改）
      const titleEl = cardEl.querySelector(".font-display");
      const titleText = titleEl?.textContent?.trim() ?? "";
      setSelPopup({
        visible: true,
        x: rect.right - 12,
        y: rect.top + 8,
        text: titleText,
        cardId,
        cardContent,
        isCardLevel: true,
      });
    },
    []
  );
```

3. `handleAsk` 改为接受 `question` 参数，携带 question + selectedText (划词时) 调 API：

```typescript
  const handleAsk = useCallback(
    async (question: string) => {
      if (askLoading) return;
      setAskLoading(true);
      try {
        const res = await fetch(`/api/micro-learning/${recordId}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            selectedText: selPopup.isCardLevel ? undefined : selPopup.text,
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
    },
    [askLoading, recordId, selPopup, onAddExtendedCard]
  );
```

4. JSX 中所有 `<LearningCard>` 渲染统一加 `onAskCard={handleAskCard}`（detail/example/extended 三处）。

5. JSX 中 `<SelectionPopup>` 修正：

```tsx
      <SelectionPopup
        visible={selPopup.visible}
        x={selPopup.x}
        y={selPopup.y}
        selectedText={selPopup.text}
        isCardLevel={selPopup.isCardLevel}
        loading={askLoading}
        onAsk={handleAsk}
        onClose={handleClosePopup}
      />
```

- [ ] 类型检查 + 全量 lint：

```bash
npx tsc --noEmit --skipLibCheck
```

预期：0 错。

- [ ] 提交：

```bash
git add components/micro-learning/selection-popup.tsx components/micro-learning/learning-card.tsx components/micro-learning/micro-learning-canvas.tsx
git commit -m "feat(micro-learning): restore custom question input + card-level ask button"
```

---

## 手动 E2E（请你自己跑）

- [ ] 启动 `npm run dev`
- [ ] 进入一个 micro-learning 页 → 拖动几张卡到非默认位置 → 等 1 秒 → F5 刷新 → 卡片回到拖动后的位置（布局持久化）
- [ ] 同一个 KP 重新生成新记录 → 新记录初始用算法布局（不是上一条记录的布局）
- [ ] 划词选中关键词 → popup 弹出输入框，默认 placeholder 是「解释「XX」」 → 改写为「举个例子」回车 → 延伸卡 title 是「关于「XX」」，content 是举例
- [ ] 点击卡片底部「提问」按钮 → popup 弹在卡片右上角，无选中文字 → 输入「这个适用什么场景」回车 → 延伸卡 title 是用户问题截断
- [ ] 同一记录的详解卡 / 例题卡内容更短，详解 ≤ 400 字、例题分析 ≤ 150 字（重新生成观察）

---

## 范围与注意

1. 本 patch 不改 V2 的整体架构，只填补三个体验差距。
2. `cardPositions` 只为同一 record 生效；新建一条记录默认走算法布局。
3. selectedText max 字数从 30 放宽到 50（API 端 schema），避免用户长选区被拦截。卡片级提问不传 selectedText。
