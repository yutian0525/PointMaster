import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
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
