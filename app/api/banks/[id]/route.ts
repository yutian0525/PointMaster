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

  const kps = db.select().from(knowledgePoints).where(eq(knowledgePoints.bankId, id)).all();
  for (const kp of kps) {
    db.delete(questionKnowledge).where(eq(questionKnowledge.knowledgePointId, kp.id)).run();
  }
  db.delete(knowledgePoints).where(eq(knowledgePoints.bankId, id)).run();
  db.delete(questions).where(eq(questions.bankId, id)).run();
  db.delete(questionBanks).where(eq(questionBanks.id, id)).run();

  return NextResponse.json({ success: true });
}
