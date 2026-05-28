import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { microLearningRecords, knowledgePoints } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const knowledgePointId = searchParams.get("knowledgePointId");

  let records;
  if (knowledgePointId) {
    records = db
      .select()
      .from(microLearningRecords)
      .where(eq(microLearningRecords.knowledgePointId, knowledgePointId))
      .orderBy(desc(microLearningRecords.createdAt))
      .all();
  } else {
    records = db
      .select()
      .from(microLearningRecords)
      .orderBy(desc(microLearningRecords.createdAt))
      .all();
  }

  const kpCache = new Map<string, string>();
  const getKpName = (kpId: string): string => {
    if (kpCache.has(kpId)) return kpCache.get(kpId)!;
    const kp = db.select().from(knowledgePoints).where(eq(knowledgePoints.id, kpId)).get();
    const name = kp?.name || "";
    kpCache.set(kpId, name);
    return name;
  };

  const items = records.map((r) => {
    const cards = JSON.parse(r.generatedCards);
    const extended = r.extendedCards ? JSON.parse(r.extendedCards) : [];
    return {
      id: r.id,
      knowledgePointId: r.knowledgePointId,
      knowledgePointName: getKpName(r.knowledgePointId),
      bankId: r.bankId,
      cardCount: cards.cards?.length || 0,
      extendedCardCount: Array.isArray(extended) ? extended.length : 0,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ records: items });
}
