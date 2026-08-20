import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { practiceSessions, questionBanks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  buildQuizPayload,
  computeKpTotalQuestions,
  fetchKpSnapshotMap,
  listAllKnowledgePoints,
} from "@/lib/practice/session-state";

const orderedKpSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  reason: z.string(),
  totalQuestions: z.number().optional(),
});

const bodySchema = z.object({
  bankId: z.string(),
  customPrompt: z.string().optional(),
  orderedKnowledgePoints: z.array(orderedKpSchema).min(1),
  planningNote: z.string().default(""),
});

export async function POST(request: NextRequest) {
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "请求参数错误" }, { status: 400 });
  }

  const bank = db
    .select()
    .from(questionBanks)
    .where(eq(questionBanks.id, body.bankId))
    .get();
  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  // 防篡改：题数从 DB 重新算
  const totalMap = computeKpTotalQuestions(body.bankId);
  const kpInBank = new Set(listAllKnowledgePoints(body.bankId).map((k) => k.id));
  const cleaned = body.orderedKnowledgePoints
    .filter((k) => kpInBank.has(k.id))
    .map((k, i) => ({
      id: k.id,
      name: k.name,
      order: i + 1,
      reason: k.reason,
      totalQuestions: totalMap.get(k.id) ?? 0,
    }));
  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "知识点列表为空或与题库不匹配" },
      { status: 400 }
    );
  }

  const snapshot = fetchKpSnapshotMap(body.bankId);
  const sessionId = uuid();
  const now = Date.now();

  db.insert(practiceSessions)
    .values({
      id: sessionId,
      bankId: body.bankId,
      knowledgePointOrder: JSON.stringify(cleaned),
      kpMasterySnapshot: JSON.stringify(snapshot),
      currentKpIndex: 0,
      currentMode: "normal",
      currentRoundIndex: 1,
      customPrompt: body.customPrompt ?? null,
      planningNote: body.planningNote,
      status: "active",
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const payload = buildQuizPayload(sessionId);
  return NextResponse.json({ sessionId, payload }, { status: 201 });
}
