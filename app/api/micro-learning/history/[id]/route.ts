import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { microLearningRecords, knowledgePoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const record = db
    .select()
    .from(microLearningRecords)
    .where(eq(microLearningRecords.id, id))
    .get();

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, record.knowledgePointId))
    .get();

  const generated = JSON.parse(record.generatedCards);
  const extended = record.extendedCards ? JSON.parse(record.extendedCards) : [];

  return NextResponse.json({
    id: record.id,
    knowledgePointId: record.knowledgePointId,
    knowledgePointName: kp?.name || "",
    cards: generated.cards || [],
    connections: generated.connections || [],
    extendedCards: Array.isArray(extended) ? extended : [],
    context: record.context ? JSON.parse(record.context) : null,
    createdAt: record.createdAt,
  });
}
