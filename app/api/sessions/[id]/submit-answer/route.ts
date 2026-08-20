import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import {
  practiceSessions,
  questions,
  questionKnowledge,
  answerRecords,
  userMastery,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { applyAnswer } from "@/lib/practice/mastery";
import { grade } from "@/lib/practice/grader";
import { safeJson } from "@/lib/practice/session-state";
import type { QuestionTypeName, SessionMode, SubmitAnswerResponse } from "@/lib/practice/types";

const bodySchema = z.object({
  questionId: z.string(),
  userAnswer: z.string(),
  timeSpent: z.number().min(0).max(3600),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "请求参数错误" }, { status: 400 });
  }

  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, sessionId))
    .get();
  if (!session) {
    return NextResponse.json({ error: "session 不存在" }, { status: 404 });
  }
  if (session.status !== "active") {
    return NextResponse.json({ error: "session 已结束" }, { status: 400 });
  }

  const question = db
    .select()
    .from(questions)
    .where(eq(questions.id, body.questionId))
    .get();
  if (!question) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  // 主知识点
  const primaryRow = db
    .select()
    .from(questionKnowledge)
    .where(
      and(
        eq(questionKnowledge.questionId, body.questionId),
        eq(questionKnowledge.isPrimary, 1)
      )
    )
    .get();
  if (!primaryRow) {
    return NextResponse.json({ error: "题目缺少主知识点归属" }, { status: 400 });
  }
  const kpId = primaryRow.knowledgePointId;
  const questionType = (question.questionType as QuestionTypeName) ?? "单选题";
  const score: 0 | 1 = grade(body.userAnswer, question.answer, questionType);

  // 现有 mastery
  const existing = db
    .select()
    .from(userMastery)
    .where(
      and(
        eq(userMastery.bankId, session.bankId),
        eq(userMastery.knowledgePointId, kpId)
      )
    )
    .get();
  const prev = existing
    ? {
        mastery: existing.mastery,
        confidence: existing.confidence,
        streak: existing.streak,
        testedCount: existing.testedCount,
        correctCount: existing.correctCount,
      }
    : { mastery: 0, confidence: 0, streak: 0, testedCount: 0, correctCount: 0 };

  const next = applyAnswer({
    prev,
    score,
    difficulty: question.difficulty,
    answerTime: body.timeSpent,
    expectedTime: question.expectedTime,
  });

  const recordId = uuid();
  const now = Date.now();

  db.transaction(() => {
    db.insert(answerRecords)
      .values({
        id: recordId,
        sessionId,
        questionId: body.questionId,
        knowledgePointId: kpId,
        userAnswer: body.userAnswer,
        correctAnswer: question.answer,
        score,
        timeSpent: body.timeSpent,
        roundIndex: session.currentRoundIndex,
        mode: session.currentMode as SessionMode,
        createdAt: now,
      })
      .run();

    if (existing) {
      db.update(userMastery)
        .set({
          mastery: next.mastery,
          confidence: next.confidence,
          streak: next.streak,
          testedCount: next.testedCount,
          correctCount: next.correctCount,
          lastUpdated: now,
        })
        .where(eq(userMastery.id, existing.id))
        .run();
    } else {
      db.insert(userMastery)
        .values({
          id: uuid(),
          bankId: session.bankId,
          knowledgePointId: kpId,
          mastery: next.mastery,
          confidence: next.confidence,
          streak: next.streak,
          testedCount: next.testedCount,
          correctCount: next.correctCount,
          lastUpdated: now,
        })
        .run();
    }

    db.update(practiceSessions)
      .set({ updatedAt: now })
      .where(eq(practiceSessions.id, sessionId))
      .run();
  });

  // 本 KP 在本 session 已答数 + 正确率
  const aggRow = db
    .select({
      total: sql<number>`count(*)`.as("total"),
      correct: sql<number>`sum(${answerRecords.score})`.as("correct"),
    })
    .from(answerRecords)
    .where(
      and(
        eq(answerRecords.sessionId, sessionId),
        eq(answerRecords.knowledgePointId, kpId)
      )
    )
    .get();
  const total = Number(aggRow?.total ?? 0);
  const correct = Number(aggRow?.correct ?? 0);
  const correctRate = total > 0 ? correct / total : 0;

  const distinctRow = db
    .select({
      cnt: sql<number>`count(distinct ${answerRecords.questionId})`.as("cnt"),
    })
    .from(answerRecords)
    .where(
      and(
        eq(answerRecords.sessionId, sessionId),
        eq(answerRecords.knowledgePointId, kpId)
      )
    )
    .get();
  const answeredCount = Number(distinctRow?.cnt ?? 0);

  const resp: SubmitAnswerResponse = {
    score,
    correctAnswer: question.answer,
    analysis: question.analysis ?? "",
    mastery: next,
    kpProgress: { answeredCount, correctRate },
    answerRecordId: recordId,
  };
  return NextResponse.json(resp);
}
