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
