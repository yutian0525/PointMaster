import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { practiceSessions, answerRecords } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { safeJson } from "@/lib/practice/session-state";
import type { OrderedKnowledgePoint } from "@/lib/practice/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, id))
    .get();
  if (!session) {
    return NextResponse.json({ error: "session 不存在" }, { status: 404 });
  }
  const order: OrderedKnowledgePoint[] = safeJson(session.knowledgePointOrder, []);
  const currentKp = order[session.currentKpIndex];
  if (!currentKp) {
    return NextResponse.json({ count: 0 });
  }

  // 取本轮（同 mode 同 round）独立做错的题数
  const row = db
    .select({
      cnt: sql<number>`count(distinct ${answerRecords.questionId})`.as("cnt"),
    })
    .from(answerRecords)
    .where(
      and(
        eq(answerRecords.sessionId, id),
        eq(answerRecords.knowledgePointId, currentKp.id),
        eq(answerRecords.mode, session.currentMode),
        eq(answerRecords.roundIndex, session.currentRoundIndex),
        eq(answerRecords.score, 0)
      )
    )
    .get();
  return NextResponse.json({ count: Number(row?.cnt ?? 0) });
}
