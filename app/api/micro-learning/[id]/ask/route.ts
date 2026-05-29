import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { microLearnings, knowledgePoints } from "@/lib/db/schema";
import { askAboutSelection } from "@/lib/ai/ask-question";
import type { ExtendedCard } from "@/types/micro-learning";

const AskSchema = z.object({
  question: z.string().min(1).max(200),
  selectedText: z.string().max(50).optional(),
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
    answer = await askAboutSelection(
      row.kpName,
      parsed.data.question,
      parsed.data.sourceCardContent,
      parsed.data.selectedText
    );
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
