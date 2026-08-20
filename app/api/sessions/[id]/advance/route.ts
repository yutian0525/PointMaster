import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { practiceSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildQuizPayload, safeJson } from "@/lib/practice/session-state";
import type { OrderedKnowledgePoint } from "@/lib/practice/types";

const bodySchema = z.object({
  action: z.enum(["redo", "wrong-redo", "next-kp", "skip"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "请求参数错误" }, { status: 400 });
  }

  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, id))
    .get();
  if (!session) return NextResponse.json({ error: "session 不存在" }, { status: 404 });
  if (session.status !== "active") {
    return NextResponse.json({ error: "session 已结束" }, { status: 400 });
  }

  const order: OrderedKnowledgePoint[] = safeJson(session.knowledgePointOrder, []);
  const now = Date.now();

  let newKpIndex = session.currentKpIndex;
  let newMode: "normal" | "redo" | "wrong-redo" = "normal";
  let newRound = 1;
  let newStatus: "active" | "completed" = "active";

  if (body.action === "redo") {
    newKpIndex = session.currentKpIndex;
    newMode = "redo";
    newRound = session.currentRoundIndex + 1;
  } else if (body.action === "wrong-redo") {
    newKpIndex = session.currentKpIndex;
    newMode = "wrong-redo";
    newRound = session.currentRoundIndex + 1;
  } else {
    // next-kp / skip
    newKpIndex = session.currentKpIndex + 1;
    newMode = "normal";
    newRound = 1;
    if (newKpIndex >= order.length) {
      newStatus = "completed";
    }
  }

  db.update(practiceSessions)
    .set({
      currentKpIndex: newKpIndex,
      currentMode: newMode,
      currentRoundIndex: newRound,
      status: newStatus,
      endedAt: newStatus === "completed" ? now : session.endedAt,
      updatedAt: now,
    })
    .where(eq(practiceSessions.id, id))
    .run();

  const payload = buildQuizPayload(id);
  return NextResponse.json(payload);
}
