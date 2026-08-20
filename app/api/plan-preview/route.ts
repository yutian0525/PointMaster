import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { knowledgePoints, questionKnowledge, questions } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { planKnowledgePointOrder, type PlanGraphInput } from "@/lib/ai/plan-order";
import { questionBanks } from "@/lib/db/schema";
import type { OrderedKnowledgePoint, PlanPreviewResponse } from "@/lib/practice/types";

const bodySchema = z.object({
  bankId: z.string(),
  customPrompt: z.string().optional(),
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

  const kpRows = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, body.bankId))
    .all();

  if (kpRows.length === 0) {
    return NextResponse.json({ error: "该题库尚未生成知识点" }, { status: 400 });
  }

  // 主知识点题数
  const countRows = db
    .select({
      kpId: questionKnowledge.knowledgePointId,
      cnt: sql<number>`count(*)`.as("cnt"),
    })
    .from(questionKnowledge)
    .innerJoin(questions, eq(questions.id, questionKnowledge.questionId))
    .where(
      and(eq(questions.bankId, body.bankId), eq(questionKnowledge.isPrimary, 1))
    )
    .groupBy(questionKnowledge.knowledgePointId)
    .all();
  const countMap = new Map<string, number>();
  for (const r of countRows) countMap.set(r.kpId, Number(r.cnt));

  const graph: PlanGraphInput[] = kpRows.map((kp) => ({
    id: kp.id,
    name: kp.name,
    description: kp.description,
    prerequisiteIds: safeJsonArray(kp.prerequisiteIds),
    questionCount: countMap.get(kp.id) ?? 0,
  }));

  const plan = await planKnowledgePointOrder(bank.name, graph, body.customPrompt);

  const ordered: OrderedKnowledgePoint[] = plan.orderedKnowledgePoints.map((p) => ({
    id: p.id,
    name: p.name,
    order: p.order,
    reason: p.reason,
    totalQuestions: countMap.get(p.id) ?? 0,
  }));

  const payload: PlanPreviewResponse = {
    orderedKnowledgePoints: ordered,
    planningNote: plan.planningNote,
  };
  return NextResponse.json(payload);
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
