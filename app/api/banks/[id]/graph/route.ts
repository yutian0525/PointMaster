import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const kps = db.select().from(knowledgePoints).where(eq(knowledgePoints.bankId, id)).all();

  const nodes = kps.map((kp) => {
    const qCount = db
      .select({ count: count() })
      .from(questionKnowledge)
      .where(eq(questionKnowledge.knowledgePointId, kp.id))
      .get();

    return {
      id: kp.id,
      name: kp.name,
      description: kp.description,
      prerequisiteIds: JSON.parse(kp.prerequisiteIds) as string[],
      questionCount: qCount?.count || 0,
    };
  });

  const edges = nodes.flatMap((node) =>
    node.prerequisiteIds.map((preId) => ({
      source: preId,
      target: node.id,
    }))
  );

  return NextResponse.json({ nodes, edges });
}
