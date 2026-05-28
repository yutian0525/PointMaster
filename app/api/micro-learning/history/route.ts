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
