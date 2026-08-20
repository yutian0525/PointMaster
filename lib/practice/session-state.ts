import { db } from "@/lib/db";
import {
  practiceSessions,
  questionBanks,
  knowledgePoints,
  questions,
  questionKnowledge,
  answerRecords,
  userMastery,
  answerAiMessages,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { pickNextQuestion } from "./selector";
import type {
  AnswerAiMessageDto,
  MasteryState,
  OrderedKnowledgePoint,
  QuestionTypeName,
  QuizCurrentQuestion,
  QuizKpItem,
  QuizPayload,
  SessionMode,
  SessionStatus,
  SubmittedQuestionInfo,
} from "./types";

export interface SessionRow {
  id: string;
  bankId: string;
  knowledgePointOrder: string;
  kpMasterySnapshot: string;
  currentKpIndex: number;
  currentMode: string;
  currentRoundIndex: number;
  status: string;
}

const EMPTY_MASTERY: MasteryState = {
  mastery: 0,
  confidence: 0,
  streak: 0,
  testedCount: 0,
  correctCount: 0,
};

export function getSessionRow(sessionId: string) {
  return db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, sessionId))
    .get();
}

export function buildQuizPayload(sessionId: string): QuizPayload | null {
  const session = getSessionRow(sessionId);
  if (!session) return null;

  const bank = db
    .select()
    .from(questionBanks)
    .where(eq(questionBanks.id, session.bankId))
    .get();
  if (!bank) return null;

  const order: OrderedKnowledgePoint[] = safeJson(session.knowledgePointOrder, []);
  const kpIds = order.map((k) => k.id);

  // mastery 表（跨 session 累积）
  const masteryRows = db
    .select()
    .from(userMastery)
    .where(eq(userMastery.bankId, session.bankId))
    .all();
  const masteryMap = new Map(masteryRows.map((r) => [r.knowledgePointId, r]));

  // 本 session 内每个 KP 的累计答题
  const sessionAnswerRows = db
    .select({
      kpId: answerRecords.knowledgePointId,
      qid: answerRecords.questionId,
      score: answerRecords.score,
    })
    .from(answerRecords)
    .where(eq(answerRecords.sessionId, sessionId))
    .all();

  type KpAccum = { distinctQ: Set<string>; total: number; correct: number };
  const kpAccum = new Map<string, KpAccum>();
  for (const r of sessionAnswerRows) {
    let a = kpAccum.get(r.kpId);
    if (!a) {
      a = { distinctQ: new Set(), total: 0, correct: 0 };
      kpAccum.set(r.kpId, a);
    }
    a.distinctQ.add(r.qid);
    a.total += 1;
    if (r.score === 1) a.correct += 1;
  }

  const knowledgePoints: QuizKpItem[] = order.map((k, i) => {
    const accum = kpAccum.get(k.id);
    const answered = accum?.distinctQ.size ?? 0;
    const correctRate = accum && accum.total > 0 ? accum.correct / accum.total : 0;
    let status: "done" | "current" | "todo";
    if (i < session.currentKpIndex) status = "done";
    else if (i === session.currentKpIndex) status = "current";
    else status = "todo";
    const m = masteryMap.get(k.id);
    return {
      id: k.id,
      name: k.name,
      order: k.order,
      totalQuestions: k.totalQuestions,
      answeredCount: answered,
      correctRate,
      mastery: m?.mastery ?? 0,
      status,
    };
  });

  const overview = order.map((k) => ({
    kpId: k.id,
    name: k.name,
    mastery: masteryMap.get(k.id)?.mastery ?? 0,
  }));

  const currentKpMeta = order[session.currentKpIndex];
  let currentKp: { id: string; name: string } | null = null;
  let currentQuestion: QuizCurrentQuestion | null = null;
  let currentMastery: MasteryState = { ...EMPTY_MASTERY };

  if (currentKpMeta) {
    currentKp = { id: currentKpMeta.id, name: currentKpMeta.name };
    const m = masteryMap.get(currentKpMeta.id);
    if (m) {
      currentMastery = {
        mastery: m.mastery,
        confidence: m.confidence,
        streak: m.streak,
        testedCount: m.testedCount,
        correctCount: m.correctCount,
      };
    }

    if (session.status === "active") {
      const picked = pickNextQuestion({
        sessionId,
        bankId: session.bankId,
        kpId: currentKpMeta.id,
        mode: session.currentMode as SessionMode,
        roundIndex: session.currentRoundIndex,
      });
      if (picked) {
        const q = db
          .select()
          .from(questions)
          .where(eq(questions.id, picked.id))
          .get();
        if (q) {
          currentQuestion = {
            id: q.id,
            content: q.content,
            options: safeJson(q.options, []),
            questionType: (q.questionType as QuestionTypeName) ?? "单选题",
            difficulty: q.difficulty ?? 0.5,
            expectedTime: q.expectedTime ?? 60,
          };
        }
      }
    }
  }

  return {
    session: {
      id: session.id,
      status: session.status as SessionStatus,
      bankId: session.bankId,
      bankName: bank.name,
      currentKpIndex: session.currentKpIndex,
      currentMode: session.currentMode as SessionMode,
      currentRoundIndex: session.currentRoundIndex,
    },
    knowledgePoints,
    currentKp,
    currentQuestion,
    mastery: currentMastery,
    overview,
  };
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function loadSubmittedInfo(answerRecordId: string): SubmittedQuestionInfo | null {
  const rec = db
    .select()
    .from(answerRecords)
    .where(eq(answerRecords.id, answerRecordId))
    .get();
  if (!rec) return null;
  const q = db.select().from(questions).where(eq(questions.id, rec.questionId)).get();
  if (!q) return null;
  const messages = db
    .select()
    .from(answerAiMessages)
    .where(eq(answerAiMessages.answerRecordId, answerRecordId))
    .orderBy(answerAiMessages.createdAt)
    .all();
  const aiMessages: AnswerAiMessageDto[] = messages.map((m) => ({
    id: m.id,
    question: m.question,
    answer: m.answer,
    createdAt: m.createdAt,
  }));
  return {
    score: rec.score === 1 ? 1 : 0,
    correctAnswer: rec.correctAnswer,
    analysis: q.analysis ?? "",
    answerRecordId,
    aiMessages,
  };
}

export function computeKpTotalQuestions(bankId: string): Map<string, number> {
  const rows = db
    .select({
      kpId: questionKnowledge.knowledgePointId,
      cnt: sql<number>`count(*)`.as("cnt"),
    })
    .from(questionKnowledge)
    .innerJoin(questions, eq(questions.id, questionKnowledge.questionId))
    .where(and(eq(questions.bankId, bankId), eq(questionKnowledge.isPrimary, 1)))
    .groupBy(questionKnowledge.knowledgePointId)
    .all();
  return new Map(rows.map((r) => [r.kpId, Number(r.cnt)]));
}

export function fetchKpSnapshotMap(bankId: string): Record<string, { mastery: number; confidence: number }> {
  const rows = db
    .select()
    .from(userMastery)
    .where(eq(userMastery.bankId, bankId))
    .all();
  const out: Record<string, { mastery: number; confidence: number }> = {};
  for (const r of rows) {
    out[r.knowledgePointId] = { mastery: r.mastery, confidence: r.confidence };
  }
  return out;
}

export function listAllKnowledgePoints(bankId: string) {
  return db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, bankId))
    .all();
}
