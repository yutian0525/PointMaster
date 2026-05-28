import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { askAboutSelection } from "@/lib/ai/ask-question";
import type { AskRequest } from "@/types";

export async function POST(request: NextRequest) {
  const body: AskRequest = await request.json();
  const { knowledgePointId, selectedText, sourceCardId, sourceCardContent } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  const result = await askAboutSelection(
    kp.name,
    selectedText,
    sourceCardId,
    sourceCardContent
  );

  return NextResponse.json(result);
}
