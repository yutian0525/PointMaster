import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { practiceSessions, questions, userMastery } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { pickNextQuestion } from "@/lib/practice/selector";
import { checkCompletion } from "@/lib/practice/completion";
import { safeJson } from "@/lib/practice/session-state";
import type {
  OrderedKnowledgePoint,
  QuestionTypeName,
  SessionMode,
} from "@/lib/practice/types";

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
  if (session.status !== "active") {
    return NextResponse.json({
      question: null,
      completionTriggered: true,
    });
  }

  const order: OrderedKnowledgePoint[] = safeJson(
    session.knowledgePointOrder,
    []
  );
  const currentKp = order[session.currentKpIndex];
  if (!currentKp) {
    return NextResponse.json({ question: null, completionTriggered: true });
  }

  const picked = pickNextQuestion({
    sessionId: id,
    bankId: session.bankId,
    kpId: currentKp.id,
    mode: session.currentMode as SessionMode,
    roundIndex: session.currentRoundIndex,
  });

  const masteryRow = db
    .select()
    .from(userMastery)
    .where(
      and(
        eq(userMastery.bankId, session.bankId),
        eq(userMastery.knowledgePointId, currentKp.id)
      )
    )
    .get();
  const masteryState = masteryRow
    ? {
        mastery: masteryRow.mastery,
        confidence: masteryRow.confidence,
        streak: masteryRow.streak,
        testedCount: masteryRow.testedCount,
        correctCount: masteryRow.correctCount,
      }
    : { mastery: 0, confidence: 0, streak: 0, testedCount: 0, correctCount: 0 };

  const completion = checkCompletion(
    !!picked,
    masteryState,
    session.currentMode as SessionMode
  );

  if (completion === "complete") {
    return NextResponse.json({ question: null, completionTriggered: true });
  }

  if (!picked) {
    return NextResponse.json({ question: null, completionTriggered: true });
  }

  const q = db
    .select()
    .from(questions)
    .where(eq(questions.id, picked.id))
    .get();
  if (!q) {
    return NextResponse.json({ question: null, completionTriggered: true });
  }

  return NextResponse.json({
    question: {
      id: q.id,
      content: q.content,
      options: safeJson<string[]>(q.options, []),
      questionType: (q.questionType as QuestionTypeName) ?? "单选题",
      difficulty: q.difficulty ?? 0.5,
      expectedTime: q.expectedTime ?? 60,
    },
    completionTriggered: false,
  });
}
