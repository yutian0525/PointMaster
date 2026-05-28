# 导入题库 → 知识图谱生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From-scratch Next.js 15 project implementing the full "import question bank → AI extract knowledge points → generate knowledge graph" pipeline with complete UI.

**Architecture:** Two-phase serial processing — Phase 1 extracts knowledge points per-question via DeepSeek, Phase 2 builds the dependency graph from all extracted points. Async processing runs in-process (no external queue), with frontend polling for progress. React Flow renders the knowledge graph with dagre auto-layout.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS v3, shadcn/ui, SQLite (better-sqlite3), Drizzle ORM, React Flow, @dagrejs/dagre, OpenAI SDK (pointed at DeepSeek), ExcelJS, Zod.

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `.env.local`, `.gitignore`

- [ ] **Step 1: Create Next.js project**

```bash
cd d:/workspace/PointMaster
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*" --use-npm
```

When prompted, accept defaults (yes to ESLint, no to src dir, yes to App Router, yes to Tailwind, no to customize import alias since we specified it).

Note: Since `.gitattributes`, `CLAUDE.md`, and `docs/` already exist, the tool may warn about non-empty directory. If it fails, use `--yes` flag or create in a temp dir and move files.

- [ ] **Step 2: Install core dependencies**

```bash
cd d:/workspace/PointMaster
npm install drizzle-orm better-sqlite3 openai exceljs zod uuid
npm install @xyflow/react @dagrejs/dagre
npm install -D @types/better-sqlite3 @types/uuid drizzle-kit
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init -d
```

This creates `components/ui/` and `lib/utils.ts`.

- [ ] **Step 4: Add shadcn components we'll need**

```bash
npx shadcn@latest add button card badge progress dialog
```

- [ ] **Step 5: Set up environment variables**

Create `.env.local`:

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-placeholder
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:

```
# Runtime data
data/
.env.local
```

- [ ] **Step 7: Set up Google Fonts in layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "PointMaster 慧刷题",
  description: "AI 自适应知识掌握系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Set up Tailwind config with design tokens**

Update `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#9fb997",
          light: "#c8d4c0",
          dark: "#6b8c64",
        },
        background: "#f4f2f0",
        "background-alt": "#eceae7",
        foreground: "#1e2822",
        "text-secondary": "#4a5248",
        "text-muted": "#7a8578",
        border: "rgba(159,185,151,0.22)",
        "border-strong": "rgba(159,185,151,0.44)",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["var(--font-body)", "Plus Jakarta Sans", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "14px",
        lg: "22px",
        xl: "28px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 9: Set up globals.css**

Replace `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --sidebar-width: 232px;
  }

  body {
    background-color: #f4f2f0;
    color: #1e2822;
  }
}

@layer utilities {
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #c8d4c0 transparent;
  }
}
```

- [ ] **Step 10: Verify project runs**

```bash
npm run dev
```

Expected: Dev server starts on http://localhost:3000 without errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 15 project with Tailwind, shadcn/ui, and dependencies"
```

---

## Task 2: Database Schema & Connection

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `lib/db/schema.ts`:

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const questionBanks = sqliteTable("question_banks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  totalQuestions: integer("total_questions").notNull().default(0),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  progressMessage: text("progress_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  content: text("content").notNull(),
  options: text("options").notNull(), // JSON array
  answer: text("answer").notNull(),
  analysis: text("analysis"),
  difficulty: real("difficulty"),
  questionType: text("question_type"),
  expectedTime: integer("expected_time"),
  aiExtracted: integer("ai_extracted").notNull().default(0),
  aiKnowledgePoints: text("ai_knowledge_points"), // JSON array
  createdAt: integer("created_at").notNull(),
});

export const knowledgePoints = sqliteTable("knowledge_points", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  name: text("name").notNull(),
  description: text("description"),
  prerequisiteIds: text("prerequisite_ids").notNull().default("[]"), // JSON array
  microContent: text("micro_content"), // JSON
  createdAt: integer("created_at").notNull(),
});

export const questionKnowledge = sqliteTable("question_knowledge", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => questions.id),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  isPrimary: integer("is_primary").notNull().default(0),
});
```

- [ ] **Step 2: Create database connection**

Create `lib/db/index.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "pointmaster.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 3: Create Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/pointmaster.db",
  },
});
```

- [ ] **Step 4: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: Migration files created in `lib/db/migrations/`, database file created at `data/pointmaster.db`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/ drizzle.config.ts
git commit -m "feat: add database schema and Drizzle ORM configuration"
```

---

## Task 3: File Parsers

**Files:**
- Create: `lib/parsers/index.ts`
- Create: `lib/parsers/excel.ts`
- Create: `lib/parsers/json.ts`
- Create: `lib/parsers/txt.ts`
- Create: `types/index.ts`

- [ ] **Step 1: Define shared types**

Create `types/index.ts`:

```ts
export interface ParsedQuestion {
  content: string;
  options: string[];
  answer: string;
  analysis?: string;
}

export interface BankStatus {
  status: "pending" | "extracting" | "building_graph" | "completed" | "failed";
  progress: number;
  progressMessage: string | null;
}

export interface KnowledgePointNode {
  id: string;
  name: string;
  description: string | null;
  prerequisiteIds: string[];
  questionCount: number;
}

export interface GraphData {
  nodes: KnowledgePointNode[];
  edges: { source: string; target: string }[];
}
```

- [ ] **Step 2: Create Excel parser**

Create `lib/parsers/excel.ts`:

```ts
import ExcelJS from "exceljs";
import { ParsedQuestion } from "@/types";

const CONTENT_HEADERS = ["题目", "题干", "question", "内容"];
const OPTION_A_HEADERS = ["a", "选项a", "a选项"];
const OPTION_B_HEADERS = ["b", "选项b", "b选项"];
const OPTION_C_HEADERS = ["c", "选项c", "c选项"];
const OPTION_D_HEADERS = ["d", "选项d", "d选项"];
const ANSWER_HEADERS = ["答案", "answer", "正确答案"];
const ANALYSIS_HEADERS = ["解析", "analysis", "详解"];

function matchHeader(cell: string, candidates: string[]): boolean {
  const normalized = cell.toLowerCase().trim();
  return candidates.includes(normalized);
}

export async function parseExcel(buffer: Buffer): Promise<ParsedQuestion[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel 文件中没有工作表");

  const headerRow = sheet.getRow(1);
  const colMap: Record<string, number> = {};

  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || "").toLowerCase().trim();
    if (CONTENT_HEADERS.includes(val)) colMap.content = colNumber;
    if (OPTION_A_HEADERS.includes(val)) colMap.a = colNumber;
    if (OPTION_B_HEADERS.includes(val)) colMap.b = colNumber;
    if (OPTION_C_HEADERS.includes(val)) colMap.c = colNumber;
    if (OPTION_D_HEADERS.includes(val)) colMap.d = colNumber;
    if (ANSWER_HEADERS.includes(val)) colMap.answer = colNumber;
    if (ANALYSIS_HEADERS.includes(val)) colMap.analysis = colNumber;
  });

  if (!colMap.content || !colMap.answer) {
    throw new Error("Excel 表头缺少必要列（题目、答案）");
  }

  const questions: ParsedQuestion[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const content = String(row.getCell(colMap.content).value || "").trim();
    if (!content) return;

    const options: string[] = [];
    if (colMap.a) options.push(String(row.getCell(colMap.a).value || ""));
    if (colMap.b) options.push(String(row.getCell(colMap.b).value || ""));
    if (colMap.c) options.push(String(row.getCell(colMap.c).value || ""));
    if (colMap.d) options.push(String(row.getCell(colMap.d).value || ""));

    const answer = String(row.getCell(colMap.answer).value || "").trim();
    const analysis = colMap.analysis
      ? String(row.getCell(colMap.analysis).value || "").trim() || undefined
      : undefined;

    questions.push({ content, options, answer, analysis });
  });

  return questions;
}
```

- [ ] **Step 3: Create JSON parser**

Create `lib/parsers/json.ts`:

```ts
import { ParsedQuestion } from "@/types";
import { z } from "zod";

const questionSchema = z.object({
  content: z.string().optional(),
  question: z.string().optional(),
  题目: z.string().optional(),
  options: z.array(z.string()),
  answer: z.string(),
  analysis: z.string().optional(),
  解析: z.string().optional(),
});

export function parseJSON(content: string): ParsedQuestion[] {
  const raw = JSON.parse(content);
  if (!Array.isArray(raw)) {
    throw new Error("JSON 文件格式错误：期望为数组");
  }

  return raw.map((item, index) => {
    const parsed = questionSchema.parse(item);
    const questionContent = parsed.content || parsed.question || parsed.题目;
    if (!questionContent) {
      throw new Error(`第 ${index + 1} 题缺少题目内容`);
    }
    return {
      content: questionContent,
      options: parsed.options,
      answer: parsed.answer,
      analysis: parsed.analysis || parsed.解析,
    };
  });
}
```

- [ ] **Step 4: Create TXT parser**

Create `lib/parsers/txt.ts`:

```ts
import { ParsedQuestion } from "@/types";

export function parseTXT(content: string): ParsedQuestion[] {
  const blocks = content.split(/\n\s*\n/).filter((b) => b.trim());
  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    let questionContent = "";
    const options: string[] = [];
    let answer = "";
    let analysis: string | undefined;

    for (const line of lines) {
      if (/^[A-D][.．、]\s*/.test(line)) {
        options.push(line);
      } else if (/^答案[：:]\s*/.test(line)) {
        answer = line.replace(/^答案[：:]\s*/, "").trim();
      } else if (/^解析[：:]\s*/.test(line)) {
        analysis = line.replace(/^解析[：:]\s*/, "").trim();
      } else if (!questionContent || (!options.length && !answer)) {
        questionContent += (questionContent ? " " : "") + line.replace(/^\d+[.．、]\s*/, "");
      }
    }

    if (questionContent && answer) {
      questions.push({ content: questionContent, options, answer, analysis });
    }
  }

  return questions;
}
```

- [ ] **Step 5: Create parser entry point**

Create `lib/parsers/index.ts`:

```ts
import { ParsedQuestion } from "@/types";
import { parseExcel } from "./excel";
import { parseJSON } from "./json";
import { parseTXT } from "./txt";

export async function parseFile(
  buffer: Buffer,
  fileName: string
): Promise<ParsedQuestion[]> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "xlsx":
    case "xls":
      return parseExcel(buffer);
    case "json":
      return parseJSON(buffer.toString("utf-8"));
    case "txt":
      return parseTXT(buffer.toString("utf-8"));
    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add types/ lib/parsers/
git commit -m "feat: add file parsers for Excel, JSON, and TXT question banks"
```

---

## Task 4: AI Client & Knowledge Point Extraction

**Files:**
- Create: `lib/ai/client.ts`
- Create: `lib/ai/extract-points.ts`
- Create: `lib/ai/build-graph.ts`

- [ ] **Step 1: Create AI client**

Create `lib/ai/client.ts`:

```ts
import OpenAI from "openai";

export function getAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY || "",
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
  });
}

export function getModel(): string {
  return process.env.LLM_MODEL || "deepseek-chat";
}
```

- [ ] **Step 2: Create knowledge point extraction**

Create `lib/ai/extract-points.ts`:

```ts
import { z } from "zod";
import { getAIClient, getModel } from "./client";

const extractionResultSchema = z.object({
  knowledge_points: z.array(z.string()).min(1).max(5),
  difficulty: z.number().min(0).max(1),
  question_type: z.string(),
  expected_time: z.number().min(5).max(300),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export async function extractKnowledgePoints(
  bankName: string,
  question: {
    content: string;
    options: string[];
    answer: string;
    analysis?: string;
  }
): Promise<ExtractionResult> {
  const client = getAIClient();

  const optionsText = question.options
    .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的知识点标注专家。请根据给定的题目信息，提取该题涉及的知识点并评估难度。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}

题目：${question.content}
选项：
${optionsText}
答案：${question.answer}
${question.analysis ? `解析：${question.analysis}` : ""}

请以 JSON 格式返回：
{
  "knowledge_points": ["知识点1", "知识点2"],
  "difficulty": 0.65,
  "question_type": "单选题",
  "expected_time": 30
}

要求：
- 知识点名称要简洁可复用（如"导数"、"极值"、"定积分"），不要写描述性文字
- difficulty 根据题目计算复杂度和概念深度综合评估
- expected_time 根据难度估算，简单题15-20秒，中等题25-40秒，难题45-90秒
- 只返回 JSON，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return extractionResultSchema.parse(parsed);
}
```

- [ ] **Step 3: Create knowledge graph builder**

Create `lib/ai/build-graph.ts`:

```ts
import { z } from "zod";
import { getAIClient, getModel } from "./client";

const graphNodeSchema = z.object({
  name: z.string(),
  description: z.string(),
  prerequisites: z.array(z.string()),
});

const graphResultSchema = z.object({
  knowledge_points: z.array(graphNodeSchema),
});

export type GraphResult = z.infer<typeof graphResultSchema>;

export async function buildKnowledgeGraph(
  bankName: string,
  knowledgePointsWithCount: { name: string; count: number }[]
): Promise<GraphResult> {
  const client = getAIClient();

  const listText = knowledgePointsWithCount
    .map((kp) => `- ${kp.name} (${kp.count}题)`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的知识体系专家。请根据给定的知识点列表，分析它们之间的学习依赖关系，构建知识图谱。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}
知识点列表（含关联题目数）：
${listText}

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
- 只返回 JSON，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return graphResultSchema.parse(parsed);
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/ai/
git commit -m "feat: add AI client, knowledge point extraction, and graph building"
```

---

## Task 5: Bank Processor (Async Orchestration)

**Files:**
- Create: `lib/process/bank-processor.ts`

- [ ] **Step 1: Create the bank processor**

Create `lib/process/bank-processor.ts`:

```ts
import { db } from "@/lib/db";
import { questionBanks, questions, knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { extractKnowledgePoints } from "@/lib/ai/extract-points";
import { buildKnowledgeGraph } from "@/lib/ai/build-graph";
import { v4 as uuid } from "uuid";

export async function processBankAsync(bankId: string): Promise<void> {
  try {
    await phase1ExtractPoints(bankId);
    await phase2BuildGraph(bankId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    db.update(questionBanks)
      .set({
        status: "failed",
        progressMessage: `处理失败: ${message}`,
        updatedAt: Date.now(),
      })
      .where(eq(questionBanks.id, bankId))
      .run();
  }
}

async function phase1ExtractPoints(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "extracting", progress: 0, progressMessage: "正在提取知识点...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  const allQuestions = db
    .select()
    .from(questions)
    .where(and(eq(questions.bankId, bankId), eq(questions.aiExtracted, 0)))
    .all();

  const total = allQuestions.length;
  let completed = 0;
  let failed = 0;

  for (const q of allQuestions) {
    try {
      const result = await extractKnowledgePoints(bank.name, {
        content: q.content,
        options: JSON.parse(q.options),
        answer: q.answer,
        analysis: q.analysis || undefined,
      });

      db.update(questions)
        .set({
          difficulty: result.difficulty,
          questionType: result.question_type,
          expectedTime: result.expected_time,
          aiExtracted: 1,
          aiKnowledgePoints: JSON.stringify(result.knowledge_points),
        })
        .where(eq(questions.id, q.id))
        .run();
    } catch (error) {
      failed++;
      // Retry once
      try {
        const result = await extractKnowledgePoints(bank.name, {
          content: q.content,
          options: JSON.parse(q.options),
          answer: q.answer,
          analysis: q.analysis || undefined,
        });

        db.update(questions)
          .set({
            difficulty: result.difficulty,
            questionType: result.question_type,
            expectedTime: result.expected_time,
            aiExtracted: 1,
            aiKnowledgePoints: JSON.stringify(result.knowledge_points),
          })
          .where(eq(questions.id, q.id))
          .run();
        failed--;
      } catch {
        // Skip this question
      }
    }

    completed++;
    const progress = Math.round((completed / total) * 70); // Phase 1 = 0-70%
    db.update(questionBanks)
      .set({
        progress,
        progressMessage: `知识点提取中 (${completed}/${total})${failed > 0 ? `，${failed} 题失败` : ""}`,
        updatedAt: Date.now(),
      })
      .where(eq(questionBanks.id, bankId))
      .run();
  }
}

async function phase2BuildGraph(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "building_graph", progress: 75, progressMessage: "正在构建知识图谱...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  // Collect all knowledge point names from extracted questions
  const extractedQuestions = db
    .select()
    .from(questions)
    .where(and(eq(questions.bankId, bankId), eq(questions.aiExtracted, 1)))
    .all();

  const kpCountMap = new Map<string, number>();
  for (const q of extractedQuestions) {
    const points: string[] = JSON.parse(q.aiKnowledgePoints || "[]");
    for (const p of points) {
      kpCountMap.set(p, (kpCountMap.get(p) || 0) + 1);
    }
  }

  const knowledgePointsWithCount = Array.from(kpCountMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  if (knowledgePointsWithCount.length === 0) {
    throw new Error("没有提取到任何知识点");
  }

  db.update(questionBanks)
    .set({ progress: 80, progressMessage: "AI 正在分析知识点依赖关系...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  // Call AI to build graph
  const graphResult = await buildKnowledgeGraph(bank.name, knowledgePointsWithCount);

  db.update(questionBanks)
    .set({ progress: 90, progressMessage: "正在写入知识图谱...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  // Create knowledge points in DB
  const nameToId = new Map<string, string>();

  for (const kp of graphResult.knowledge_points) {
    const id = uuid();
    nameToId.set(kp.name, id);
    db.insert(knowledgePoints)
      .values({
        id,
        bankId,
        name: kp.name,
        description: kp.description,
        prerequisiteIds: "[]", // Will update after all are created
        createdAt: Date.now(),
      })
      .run();
  }

  // Update prerequisite_ids with actual IDs
  for (const kp of graphResult.knowledge_points) {
    const id = nameToId.get(kp.name);
    if (!id) continue;
    const prereqIds = kp.prerequisites
      .map((name) => nameToId.get(name))
      .filter((id): id is string => !!id);
    db.update(knowledgePoints)
      .set({ prerequisiteIds: JSON.stringify(prereqIds) })
      .where(eq(knowledgePoints.id, id))
      .run();
  }

  // Create question_knowledge associations
  for (const q of extractedQuestions) {
    const points: string[] = JSON.parse(q.aiKnowledgePoints || "[]");
    for (let i = 0; i < points.length; i++) {
      const kpId = nameToId.get(points[i]);
      if (!kpId) continue;
      db.insert(questionKnowledge)
        .values({
          id: uuid(),
          questionId: q.id,
          knowledgePointId: kpId,
          isPrimary: i === 0 ? 1 : 0,
        })
        .run();
    }
  }

  // Mark as completed
  db.update(questionBanks)
    .set({
      status: "completed",
      progress: 100,
      progressMessage: `完成！提取了 ${nameToId.size} 个知识点`,
      updatedAt: Date.now(),
    })
    .where(eq(questionBanks.id, bankId))
    .run();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/process/
git commit -m "feat: add async bank processor with two-phase extraction and graph building"
```

---

## Task 6: API Routes

**Files:**
- Create: `app/api/banks/route.ts`
- Create: `app/api/banks/[id]/route.ts`
- Create: `app/api/banks/[id]/process/route.ts`
- Create: `app/api/banks/[id]/status/route.ts`
- Create: `app/api/banks/[id]/graph/route.ts`

- [ ] **Step 1: Create bank list & upload API**

Create `app/api/banks/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks, questions } from "@/lib/db/schema";
import { parseFile } from "@/lib/parsers";
import { v4 as uuid } from "uuid";
import { desc } from "drizzle-orm";
import path from "path";
import fs from "fs";

export async function GET() {
  const banks = db.select().from(questionBanks).orderBy(desc(questionBanks.createdAt)).all();
  return NextResponse.json(banks);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 });
  }

  const fileName = file.name;
  const bankName = name || fileName.replace(/\.[^.]+$/, "");

  // Save file to disk
  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const savedFileName = `${Date.now()}-${fileName}`;
  fs.writeFileSync(path.join(uploadsDir, savedFileName), buffer);

  // Parse file
  let parsedQuestions;
  try {
    parsedQuestions = await parseFile(buffer, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (parsedQuestions.length === 0) {
    return NextResponse.json({ error: "未从文件中提取到任何题目" }, { status: 400 });
  }

  // Create bank record
  const bankId = uuid();
  const now = Date.now();

  db.insert(questionBanks)
    .values({
      id: bankId,
      name: bankName,
      fileName: savedFileName,
      totalQuestions: parsedQuestions.length,
      status: "pending",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Insert questions
  for (const q of parsedQuestions) {
    db.insert(questions)
      .values({
        id: uuid(),
        bankId,
        content: q.content,
        options: JSON.stringify(q.options),
        answer: q.answer,
        analysis: q.analysis || null,
        aiExtracted: 0,
        createdAt: now,
      })
      .run();
  }

  return NextResponse.json({ id: bankId, totalQuestions: parsedQuestions.length }, { status: 201 });
}
```

- [ ] **Step 2: Create bank detail & delete API**

Create `app/api/banks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks, questions, knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, id)).get();

  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  const kpCount = db
    .select({ count: count() })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, id))
    .get();

  return NextResponse.json({
    ...bank,
    knowledgePointCount: kpCount?.count || 0,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Delete in order: question_knowledge → knowledge_points → questions → bank
  const kps = db.select().from(knowledgePoints).where(eq(knowledgePoints.bankId, id)).all();
  for (const kp of kps) {
    db.delete(questionKnowledge).where(eq(questionKnowledge.knowledgePointId, kp.id)).run();
  }
  db.delete(knowledgePoints).where(eq(knowledgePoints.bankId, id)).run();
  db.delete(questions).where(eq(questions.bankId, id)).run();
  db.delete(questionBanks).where(eq(questionBanks.id, id)).run();

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create process trigger API**

Create `app/api/banks/[id]/process/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processBankAsync } from "@/lib/process/bank-processor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, id)).get();

  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  if (bank.status === "extracting" || bank.status === "building_graph") {
    return NextResponse.json({ error: "题库正在处理中" }, { status: 409 });
  }

  // Fire and forget — don't await
  processBankAsync(id);

  return NextResponse.json({ status: "started" }, { status: 202 });
}
```

- [ ] **Step 4: Create status polling API**

Create `app/api/banks/[id]/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = db
    .select({
      status: questionBanks.status,
      progress: questionBanks.progress,
      progressMessage: questionBanks.progressMessage,
    })
    .from(questionBanks)
    .where(eq(questionBanks.id, id))
    .get();

  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  return NextResponse.json(bank);
}
```

- [ ] **Step 5: Create graph data API**

Create `app/api/banks/[id]/graph/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const kps = db.select().from(knowledgePoints).where(eq(knowledgePoints.bankId, id)).all();

  // Get question counts for each knowledge point
  const nodes = await Promise.all(
    kps.map(async (kp) => {
      const qCount = db
        .select({ count: count() })
        .from(questionKnowledge)
        .where(eq(questionKnowledge.knowledgePointId, kp.id))
        .get();

      return {
        id: kp.id,
        name: kp.name,
        description: kp.description,
        prerequisiteIds: JSON.parse(kp.prerequisiteIds) as string[],
        questionCount: qCount?.count || 0,
      };
    })
  );

  const edges = nodes.flatMap((node) =>
    node.prerequisiteIds.map((preId) => ({
      source: preId,
      target: node.id,
    }))
  );

  return NextResponse.json({ nodes, edges });
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/
git commit -m "feat: add API routes for bank CRUD, processing, status, and graph data"
```

---

## Task 7: Sidebar Layout Component

**Files:**
- Create: `components/layout/sidebar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create sidebar component**

Create `components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    section: "学习",
    items: [
      { label: "首页", href: "/", icon: "home", enabled: true },
      { label: "题库管理", href: "/banks", icon: "book", enabled: true },
      { label: "练习模式", href: "#", icon: "play", enabled: false, badge: "新" },
    ],
  },
  {
    section: "进行中",
    items: [
      { label: "自适应刷题", href: "#", icon: "check", enabled: false },
      { label: "微学习", href: "#", icon: "monitor", enabled: false },
      { label: "掌握报告", href: "#", icon: "chart", enabled: false },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
    book: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
    play: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10,8 16,12 10,16 10,8" />
      </svg>
    ),
    check: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
    monitor: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    chart: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  };
  return <span className="opacity-65">{icons[name]}</span>;
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[232px] flex-shrink-0 bg-white border-r border-border flex flex-col h-screen overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center flex-shrink-0">
            <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
            </svg>
          </div>
          <div>
            <div className="font-display text-[14.5px] font-semibold text-foreground tracking-tight">
              PointMaster
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-widest">
              慧刷题
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 overflow-y-auto scrollbar-thin">
        {navItems.map((section) => (
          <div key={section.section} className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted px-2.5 mb-1">
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              if (!item.enabled) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] font-medium text-text-muted/50 cursor-not-allowed"
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto bg-primary text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] font-medium transition-all relative ${
                    isActive
                      ? "bg-primary/15 text-primary-dark"
                      : "text-text-secondary hover:bg-background hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-primary-dark rounded-r-sm" />
                  )}
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-[12px] font-bold text-primary-dark flex-shrink-0">
            倪
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-foreground">倪镭</div>
            <div className="text-[11px] text-text-muted">🔥 连续 7 天</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Update layout to include sidebar**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "PointMaster 慧刷题",
  description: "AI 自适应知识掌握系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create home page redirect**

Replace `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/banks");
}
```

- [ ] **Step 4: Verify layout renders**

```bash
npm run dev
```

Visit http://localhost:3000 — should redirect to /banks (which will 404 for now, but sidebar should render).

- [ ] **Step 5: Commit**

```bash
git add components/layout/ app/layout.tsx app/page.tsx
git commit -m "feat: add sidebar layout component with navigation"
```

---

## Task 8: Banks List Page (Upload + Cards)

**Files:**
- Create: `app/banks/page.tsx`
- Create: `components/banks/upload-strip.tsx`
- Create: `components/banks/bank-card.tsx`

- [ ] **Step 1: Create upload strip component**

Create `components/banks/upload-strip.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadStrip() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleFileSelect(file: File) {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/banks", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }

      // Trigger processing
      await fetch(`/api/banks/${data.id}/process`, { method: "POST" });

      // Navigate to detail page
      router.push(`/banks/${data.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="flex items-center gap-4 border-[1.5px] border-dashed border-border-strong rounded-lg p-[18px] cursor-pointer bg-[rgba(200,212,192,0.04)] hover:border-primary hover:bg-[rgba(159,185,151,0.07)] transition-all"
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="w-[42px] h-[42px] rounded-xl flex-shrink-0 bg-gradient-to-br from-primary-light to-background border border-border-strong flex items-center justify-center">
        <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--primary-dark, #6b8c64)" }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17,8 12,3 7,8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold text-foreground mb-0.5">
          {uploading ? "正在上传..." : "导入新题库"}
        </div>
        <div className="text-[12px] text-text-muted">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            "支持 Excel、JSON、TXT 格式 — AI 自动提取知识点并构建知识图谱"
          )}
        </div>
      </div>
      <button
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[13px] font-semibold shadow-sm hover:shadow-md hover:-translate-y-px transition-all"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={uploading}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        选择文件
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.json,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create bank card component**

Create `components/banks/bank-card.tsx`:

```tsx
"use client";

import Link from "next/link";

interface BankCardProps {
  bank: {
    id: string;
    name: string;
    totalQuestions: number;
    status: string;
    progress: number;
    progressMessage: string | null;
    createdAt: number;
  };
}

function StatusChip({ status, progress }: { status: string; progress: number }) {
  switch (status) {
    case "pending":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.1)] text-text-muted">等待处理</span>;
    case "extracting":
    case "building_graph":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.15)] text-primary-dark">AI 解析中... {progress}%</span>;
    case "completed":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(107,140,100,0.14)] text-primary-dark">已完成 ✓</span>;
    case "failed":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,90,90,0.14)] text-[#9a3830]">处理失败</span>;
    default:
      return null;
  }
}

export function BankCard({ bank }: BankCardProps) {
  const date = new Date(bank.createdAt).toLocaleDateString("zh-CN");

  return (
    <Link
      href={`/banks/${bank.id}`}
      className="block bg-white border border-border rounded-md p-[18px] transition-all relative overflow-hidden hover:-translate-y-0.5 hover:shadow-md group"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-primary-dark rounded-t-[3px]" />
      <div className="text-[28px] mb-3">📐</div>
      <div className="font-display text-[15.5px] font-semibold text-foreground mb-1">
        {bank.name}
      </div>
      <div className="text-[11.5px] text-text-muted mb-3">
        {bank.totalQuestions} 题 · 导入 {date}
      </div>
      <StatusChip status={bank.status} progress={bank.progress} />

      {(bank.status === "extracting" || bank.status === "building_graph") && (
        <div className="mt-3">
          <div className="w-full h-[5px] bg-background-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all duration-700"
              style={{ width: `${bank.progress}%` }}
            />
          </div>
          {bank.progressMessage && (
            <div className="text-[10.5px] text-text-muted mt-1">{bank.progressMessage}</div>
          )}
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: Create banks page**

Create `app/banks/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { UploadStrip } from "@/components/banks/upload-strip";
import { BankCard } from "@/components/banks/bank-card";

export const dynamic = "force-dynamic";

export default function BanksPage() {
  const banks = db.select().from(questionBanks).orderBy(desc(questionBanks.createdAt)).all();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-[38px] pt-[30px] flex-shrink-0">
        <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-primary-dark mb-1">
          题库管理
        </div>
        <div className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">
          我的题库
        </div>
        <div className="mt-1 text-[13.5px] text-text-muted">
          管理、上传题库，点击题库可查看详情与知识图谱
        </div>
      </div>

      <div className="flex-1 px-[38px] py-6 overflow-y-auto">
        <UploadStrip />

        {banks.length > 0 && (
          <>
            <div className="font-display text-[16px] font-semibold text-foreground tracking-tight mb-3.5 mt-6">
              全部题库（{banks.length}）
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5">
              {banks.map((bank) => (
                <BankCard key={bank.id} bank={bank} />
              ))}
            </div>
          </>
        )}

        {banks.length === 0 && (
          <div className="text-center py-20 text-text-muted text-[14px]">
            还没有题库，点击上方上传你的第一个题库
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify page renders**

```bash
npm run dev
```

Visit http://localhost:3000/banks — should show upload strip and empty state.

- [ ] **Step 5: Commit**

```bash
git add app/banks/page.tsx components/banks/
git commit -m "feat: add banks list page with upload and card grid"
```

---

## Task 9: Bank Detail Page with Status Polling

**Files:**
- Create: `app/banks/[id]/page.tsx`
- Create: `components/banks/bank-detail-client.tsx`

- [ ] **Step 1: Create client-side detail component with polling**

Create `components/banks/bank-detail-client.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { GraphView } from "@/components/knowledge-graph/graph-view";
import type { BankStatus, GraphData } from "@/types";

interface BankDetailClientProps {
  bankId: string;
  initialBank: {
    id: string;
    name: string;
    totalQuestions: number;
    status: string;
    progress: number;
    progressMessage: string | null;
    knowledgePointCount: number;
    createdAt: number;
  };
}

export function BankDetailClient({ bankId, initialBank }: BankDetailClientProps) {
  const [bank, setBank] = useState(initialBank);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/banks/${bankId}/status`);
    if (res.ok) {
      const data: BankStatus = await res.json();
      setBank((prev) => ({
        ...prev,
        status: data.status,
        progress: data.progress,
        progressMessage: data.progressMessage,
      }));
      return data.status;
    }
    return bank.status;
  }, [bankId, bank.status]);

  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true);
    const res = await fetch(`/api/banks/${bankId}/graph`);
    if (res.ok) {
      const data: GraphData = await res.json();
      setGraphData(data);
    }
    setLoadingGraph(false);
  }, [bankId]);

  useEffect(() => {
    if (bank.status === "completed") {
      fetchGraph();
      return;
    }

    if (bank.status === "pending" || bank.status === "failed") {
      return;
    }

    // Poll while processing
    const interval = setInterval(async () => {
      const status = await fetchStatus();
      if (status === "completed" || status === "failed") {
        clearInterval(interval);
        if (status === "completed") {
          fetchGraph();
          // Refresh bank detail
          const res = await fetch(`/api/banks/${bankId}`);
          if (res.ok) {
            const data = await res.json();
            setBank(data);
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [bank.status, bankId, fetchStatus, fetchGraph]);

  const date = new Date(bank.createdAt).toLocaleDateString("zh-CN");
  const isProcessing = bank.status === "extracting" || bank.status === "building_graph";

  async function handleRetry() {
    await fetch(`/api/banks/${bankId}/process`, { method: "POST" });
    setBank((prev) => ({ ...prev, status: "extracting", progress: 0 }));
  }

  return (
    <div className="flex-1 px-[38px] py-6 overflow-y-auto">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div className="bg-white border border-border rounded-md p-[18px]">
          <div className="font-display text-[34px] font-bold text-foreground leading-none">
            {bank.totalQuestions}
          </div>
          <div className="text-[12.5px] text-text-muted mt-0.5">题目总数</div>
        </div>
        <div className="bg-white border border-border rounded-md p-[18px]">
          <div className="font-display text-[34px] font-bold text-foreground leading-none">
            {bank.knowledgePointCount}
          </div>
          <div className="text-[12.5px] text-text-muted mt-0.5">知识点总数</div>
          {bank.status !== "completed" && (
            <div className="text-[11.5px] text-primary-dark mt-2">
              {isProcessing ? "提取中..." : "待处理"}
            </div>
          )}
        </div>
      </div>

      {/* Processing progress */}
      {isProcessing && (
        <div className="bg-white border border-border rounded-md p-[18px] mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold text-foreground">AI 解析进度</div>
            <span className="text-[12.5px] font-bold text-primary-dark">{bank.progress}%</span>
          </div>
          <div className="w-full h-[6px] bg-background-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all duration-500"
              style={{ width: `${bank.progress}%` }}
            />
          </div>
          {bank.progressMessage && (
            <div className="text-[11.5px] text-text-muted mt-2">{bank.progressMessage}</div>
          )}
        </div>
      )}

      {/* Failed state */}
      {bank.status === "failed" && (
        <div className="bg-white border border-[rgba(200,90,90,0.3)] rounded-md p-[18px] mt-4">
          <div className="text-[13px] font-semibold text-[#9a3830] mb-1">处理失败</div>
          <div className="text-[12px] text-text-muted mb-3">{bank.progressMessage}</div>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold"
          >
            重新处理
          </button>
        </div>
      )}

      {/* Knowledge Graph */}
      {bank.status === "completed" && (
        <div className="mt-5">
          <div className="bg-white border border-border rounded-lg overflow-hidden" style={{ height: "400px" }}>
            {loadingGraph ? (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                加载知识图谱...
              </div>
            ) : graphData && graphData.nodes.length > 0 ? (
              <GraphView data={graphData} bankName={bank.name} />
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                暂无知识图谱数据
              </div>
            )}
          </div>
          <div className="mt-2.5 text-[11.5px] text-text-muted">
            → 点击任意节点可查看知识点详情及例题 · 箭头方向 = 学习依赖关系
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create bank detail page (server component)**

Create `app/banks/[id]/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { questionBanks, knowledgePoints } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BankDetailClient } from "@/components/banks/bank-detail-client";

export const dynamic = "force-dynamic";

export default async function BankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, id)).get();

  if (!bank) {
    notFound();
  }

  const kpCount = db
    .select({ count: count() })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, id))
    .get();

  const initialBank = {
    ...bank,
    knowledgePointCount: kpCount?.count || 0,
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-[38px] pt-[30px] flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2.5 text-[10.5px] font-bold tracking-[0.1em] uppercase text-primary-dark mb-2">
          <Link
            href="/banks"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium text-primary-dark hover:bg-[rgba(159,185,151,0.1)] transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            题库管理
          </Link>
          <span className="text-border-strong">／</span>
          <span>{bank.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-5 mt-2">
          <div>
            <div className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">
              📐 {bank.name}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
                {bank.totalQuestions} 题
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
                {kpCount?.count || 0} 知识点
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,165,110,0.18)] text-[#7a5820]">
                导入 {new Date(bank.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <BankDetailClient bankId={id} initialBank={initialBank} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/banks/\[id\]/ components/banks/bank-detail-client.tsx
git commit -m "feat: add bank detail page with status polling"
```

---

## Task 10: Knowledge Graph Visualization (React Flow)

**Files:**
- Create: `components/knowledge-graph/graph-view.tsx`
- Create: `components/knowledge-graph/knowledge-node.tsx`
- Create: `components/knowledge-graph/node-popup.tsx`

- [ ] **Step 1: Create custom knowledge node**

Create `components/knowledge-graph/knowledge-node.tsx`:

```tsx
"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

interface KnowledgeNodeData {
  name: string;
  questionCount: number;
  isRoot: boolean;
}

export function KnowledgeNode({ data }: NodeProps) {
  const { name, questionCount, isRoot } = data as unknown as KnowledgeNodeData;

  if (isRoot) {
    return (
      <div className="px-[18px] py-2 rounded-[50px] bg-[#6b8c64] text-white text-[13px] font-semibold cursor-pointer shadow-sm hover:scale-105 hover:shadow-md transition-all whitespace-nowrap">
        <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
        {name}
        <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      </div>
    );
  }

  return (
    <div className="px-[14px] py-[6px] rounded-[50px] bg-white border-2 border-[#9fb997] text-[12px] font-semibold text-[#6b8c64] cursor-pointer shadow-sm hover:bg-[#9fb997] hover:text-white hover:scale-105 hover:shadow-md transition-all whitespace-nowrap">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      {name}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}
```

- [ ] **Step 2: Create node popup component**

Create `components/knowledge-graph/node-popup.tsx`:

```tsx
"use client";

import type { KnowledgePointNode } from "@/types";

interface NodePopupProps {
  node: KnowledgePointNode;
  allNodes: KnowledgePointNode[];
  onClose: () => void;
}

export function NodePopup({ node, allNodes, onClose }: NodePopupProps) {
  const prerequisites = node.prerequisiteIds
    .map((id) => allNodes.find((n) => n.id === id))
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 bg-[rgba(30,40,34,0.32)] z-[2000] flex items-center justify-center backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(30,40,34,0.22),0_4px_16px_rgba(30,40,34,0.1)] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between flex-shrink-0">
          <div>
            <div className="font-display text-[22px] font-bold text-foreground tracking-tight mb-1.5">
              {node.name}
            </div>
            <div className="text-[13px] text-text-secondary leading-relaxed max-w-[380px]">
              {node.description || "暂无描述"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-full bg-background flex items-center justify-center text-text-muted hover:bg-background-alt hover:text-foreground transition-all flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          <div className="flex gap-1.5 flex-wrap mb-4">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
              {node.questionCount} 道题
            </span>
            {prerequisites.length === 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.1)] text-text-muted">
                无前置要求
              </span>
            ) : (
              prerequisites.map((p) => (
                <span
                  key={p!.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,165,110,0.18)] text-[#7a5820]"
                >
                  前置：{p!.name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border flex gap-2.5 justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] bg-background text-text-secondary border border-border-strong text-[12.5px] font-semibold hover:bg-white hover:text-foreground transition-all"
          >
            关闭
          </button>
          <button
            className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold opacity-50 cursor-not-allowed"
            disabled
          >
            进入微学习 →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create graph view container**

Create `components/knowledge-graph/graph-view.tsx`:

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { KnowledgeNode } from "./knowledge-node";
import { NodePopup } from "./node-popup";
import type { GraphData, KnowledgePointNode } from "@/types";

const nodeTypes: NodeTypes = {
  knowledgeNode: KnowledgeNode,
};

function getLayoutedElements(data: GraphData) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });

  for (const node of data.nodes) {
    g.setNode(node.id, { width: 150, height: 40 });
  }
  for (const edge of data.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "knowledgeNode",
      data: {
        name: node.name,
        questionCount: node.questionCount,
        isRoot: node.prerequisiteIds.length === 0,
      },
      position: { x: pos.x - 75, y: pos.y - 20 },
    };
  });

  const edges: Edge[] = data.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    style: { stroke: "#9fb997", strokeWidth: 1.5, strokeOpacity: 0.7 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9fb997" },
  }));

  return { nodes, edges };
}

interface GraphViewProps {
  data: GraphData;
  bankName: string;
}

export function GraphView({ data, bankName }: GraphViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => getLayoutedElements(data),
    [data]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<KnowledgePointNode | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const found = data.nodes.find((n) => n.id === node.id);
      if (found) setSelectedNode(found);
    },
    [data.nodes]
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#c8d4c0" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-white !border-border !shadow-sm !rounded-lg"
        />
      </ReactFlow>

      {selectedNode && (
        <NodePopup
          node={selectedNode}
          allNodes={data.nodes}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/knowledge-graph/
git commit -m "feat: add knowledge graph visualization with React Flow and node popup"
```

---

## Task 11: Integration Test & Final Verification

**Files:**
- Create: `data/test-bank.json` (test fixture)

- [ ] **Step 1: Create a test fixture file**

Create `data/test-bank.json`:

```json
[
  {
    "content": "求函数 f(x) = x³ - 3x + 2 的极值",
    "options": ["f(x) 在 x=1 处取得极大值", "f(x) 在 x=-1 处取得极大值，在 x=1 处取得极小值", "f(x) 在 x=0 处取得极值", "f(x) 没有极值"],
    "answer": "B",
    "analysis": "f'(x) = 3x² - 3 = 3(x+1)(x-1)，令 f'(x) = 0 得 x = ±1。f''(-1) = -6 < 0，故 x=-1 为极大值点；f''(1) = 6 > 0，故 x=1 为极小值点。"
  },
  {
    "content": "求 lim(x→0) sin(x)/x 的值",
    "options": ["0", "1", "∞", "不存在"],
    "answer": "B",
    "analysis": "这是一个重要极限，利用夹逼定理可证明 lim(x→0) sin(x)/x = 1。"
  },
  {
    "content": "设 f(x) = e^x，求 f'(x)",
    "options": ["e^x", "xe^(x-1)", "e^(x-1)", "ln(x)·e^x"],
    "answer": "A",
    "analysis": "指数函数 e^x 的导数是其本身，即 (e^x)' = e^x。"
  },
  {
    "content": "求 ∫(2x + 3)dx",
    "options": ["x² + 3x + C", "2x² + 3x + C", "x² + 3 + C", "2x + C"],
    "answer": "A",
    "analysis": "∫(2x + 3)dx = 2·(x²/2) + 3x + C = x² + 3x + C"
  },
  {
    "content": "函数 f(x) = |x| 在 x=0 处是否可导？",
    "options": ["可导，导数为 0", "可导，导数为 1", "不可导，左右导数不相等", "不可导，函数不连续"],
    "answer": "C",
    "analysis": "f'(0⁺) = 1, f'(0⁻) = -1，左右导数不相等，所以 f(x)=|x| 在 x=0 处不可导。但函数在 x=0 处连续。"
  }
]
```

- [ ] **Step 2: Run the full dev server and test upload flow**

```bash
npm run dev
```

Manual verification steps:
1. Open http://localhost:3000/banks
2. Click "选择文件", select `data/test-bank.json`
3. Should redirect to `/banks/{id}` detail page
4. Should see processing progress updating every 2 seconds
5. Once complete (status = "completed"), knowledge graph should render
6. Click a node — popup should appear with knowledge point details

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit test fixture and any fixes**

```bash
git add data/test-bank.json
git commit -m "feat: add test fixture and verify full import-to-graph pipeline"
```

- [ ] **Step 5: Final commit — update .gitignore to keep test fixture**

Update `.gitignore` to exclude `data/` but keep `data/test-bank.json`:

```
# Runtime data
data/uploads/
data/*.db
data/*.db-wal
data/*.db-shm
.env.local
```

```bash
git add .gitignore
git commit -m "chore: refine .gitignore to keep test fixtures"
```

---

## Summary

| Task | What it delivers |
|------|-----------------|
| 1 | Next.js project with all dependencies, Tailwind + shadcn configured |
| 2 | Database schema + Drizzle ORM + migrations |
| 3 | File parsers (Excel, JSON, TXT) |
| 4 | AI client + knowledge extraction + graph building prompts |
| 5 | Async bank processor orchestrating the two phases |
| 6 | All API routes (CRUD, process, status, graph) |
| 7 | Sidebar layout matching design spec |
| 8 | Banks list page with upload and card grid |
| 9 | Bank detail page with status polling |
| 10 | Knowledge graph visualization (React Flow + dagre + popup) |
| 11 | Integration test with fixture data |
