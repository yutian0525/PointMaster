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
  positions?: unknown[];
  context: unknown;
  recordId?: string | null;
}

export async function POST(request: NextRequest) {
  const body: CompleteRequest = await request.json();
  const { knowledgePointId, cards, connections, extendedCards, positions, context, recordId } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  const generatedCards = JSON.stringify({ cards, connections, positions: positions || [] });
  const extendedCardsJson = extendedCards.length > 0 ? JSON.stringify(extendedCards) : null;
  const contextJson = context ? JSON.stringify(context) : null;

  // Upsert: update existing record or create new
  if (recordId) {
    const existing = db
      .select()
      .from(microLearningRecords)
      .where(eq(microLearningRecords.id, recordId))
      .get();

    if (existing) {
      db.update(microLearningRecords)
        .set({
          generatedCards,
          extendedCards: extendedCardsJson,
          context: contextJson,
        })
        .where(eq(microLearningRecords.id, recordId))
        .run();
      return NextResponse.json({ id: recordId });
    }
  }

  const id = uuid();
  db.insert(microLearningRecords).values({
    id,
    knowledgePointId,
    bankId: kp.bankId,
    generatedCards,
    extendedCards: extendedCardsJson,
    context: contextJson,
    createdAt: Date.now(),
  }).run();

  return NextResponse.json({ id });
}
