import { db } from "@/lib/db";
import { questions, questionKnowledge, answerRecords } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { SelectorContext } from "./types";

export interface SelectorPoolItem {
  id: string;
  difficulty: number | null;
}

export interface SelectorDataSource {
  primaryQuestionIds(kpId: string): string[];
  wrongIdsInPrevRound(sessionId: string, kpId: string, prevRound: number): string[];
  doneIdsInRound(
    sessionId: string,
    kpId: string,
    mode: SelectorContext["mode"],
    roundIndex: number
  ): string[];
  questionsByIds(ids: string[]): SelectorPoolItem[];
}

export function pickNextQuestionWith(
  ctx: SelectorContext,
  ds: SelectorDataSource
): SelectorPoolItem | null {
  const primary = ds.primaryQuestionIds(ctx.kpId);
  if (primary.length === 0) return null;

  let pool: string[];
  if (ctx.mode === "wrong-redo") {
    const wrong = ds.wrongIdsInPrevRound(ctx.sessionId, ctx.kpId, ctx.roundIndex - 1);
    const primarySet = new Set(primary);
    pool = Array.from(new Set(wrong)).filter((id) => primarySet.has(id));
  } else {
    pool = primary;
  }
  if (pool.length === 0) return null;

  const done = new Set(
    ds.doneIdsInRound(ctx.sessionId, ctx.kpId, ctx.mode, ctx.roundIndex)
  );
  const remaining = pool.filter((id) => !done.has(id));
  if (remaining.length === 0) return null;

  const items = ds.questionsByIds(remaining);
  items.sort((a, b) => {
    const da = a.difficulty ?? 0.5;
    const db_ = b.difficulty ?? 0.5;
    if (da !== db_) return da - db_;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return items[0] ?? null;
}

export const dbDataSource: SelectorDataSource = {
  primaryQuestionIds(kpId) {
    const rows = db
      .select({ qid: questionKnowledge.questionId })
      .from(questionKnowledge)
      .where(
        and(
          eq(questionKnowledge.knowledgePointId, kpId),
          eq(questionKnowledge.isPrimary, 1)
        )
      )
      .all();
    return rows.map((r) => r.qid);
  },
  wrongIdsInPrevRound(sessionId, kpId, prevRound) {
    if (prevRound < 1) return [];
    const rows = db
      .select({ qid: answerRecords.questionId })
      .from(answerRecords)
      .where(
        and(
          eq(answerRecords.sessionId, sessionId),
          eq(answerRecords.knowledgePointId, kpId),
          eq(answerRecords.roundIndex, prevRound),
          eq(answerRecords.score, 0)
        )
      )
      .all();
    return rows.map((r) => r.qid);
  },
  doneIdsInRound(sessionId, kpId, mode, roundIndex) {
    const rows = db
      .select({ qid: answerRecords.questionId })
      .from(answerRecords)
      .where(
        and(
          eq(answerRecords.sessionId, sessionId),
          eq(answerRecords.knowledgePointId, kpId),
          eq(answerRecords.mode, mode),
          eq(answerRecords.roundIndex, roundIndex)
        )
      )
      .all();
    return rows.map((r) => r.qid);
  },
  questionsByIds(ids) {
    if (ids.length === 0) return [];
    const rows = db
      .select({ id: questions.id, difficulty: questions.difficulty })
      .from(questions)
      .where(inArray(questions.id, ids))
      .all();
    return rows;
  },
};

export function pickNextQuestion(ctx: SelectorContext): SelectorPoolItem | null {
  return pickNextQuestionWith(ctx, dbDataSource);
}
