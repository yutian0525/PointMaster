import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgePoints, questions, questionKnowledge } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateMicroLearning } from "@/lib/ai/generate-micro";
import type { GenerateRequest } from "@/types";

export async function POST(request: NextRequest) {
  const body: GenerateRequest = await request.json();
  const { knowledgePointId, context } = body;

  const kp = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.id, knowledgePointId))
    .get();

  if (!kp) {
    return NextResponse.json({ error: "Knowledge point not found" }, { status: 404 });
  }

  let finalContext = context;

  if (!finalContext) {
    const qkLinks = db
      .select({ questionId: questionKnowledge.questionId })
      .from(questionKnowledge)
      .where(eq(questionKnowledge.knowledgePointId, knowledgePointId))
      .all();

    if (qkLinks.length > 0) {
      const questionIds = qkLinks.map((l) => l.questionId);
      const relatedQuestions = db
        .select()
        .from(questions)
        .all()
        .filter((q) => questionIds.includes(q.id))
        .slice(0, 5);

      finalContext = {
        questions: relatedQuestions.map((q) => ({
          id: q.id,
          content: q.content,
          options: JSON.parse(q.options),
          answer: q.answer,
          analysis: q.analysis || undefined,
        })),
      };
    }
  }

  const result = await generateMicroLearning(
    { name: kp.name, description: kp.description },
    finalContext
  );

  return NextResponse.json(result);
}
