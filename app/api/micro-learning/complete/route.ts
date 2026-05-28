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
