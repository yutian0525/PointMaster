import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microLearnings, knowledgePoints } from "@/lib/db/schema";
import type {
  ExampleAnalysis,
  ExtendedCard,
  MicroLearningRecord,
  SavedCardPosition,
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
    cardPositions,
    sourceQuestionIds,
    createdAt: row.ml.createdAt,
    updatedAt: row.ml.updatedAt,
  };

  return NextResponse.json(record);
}
