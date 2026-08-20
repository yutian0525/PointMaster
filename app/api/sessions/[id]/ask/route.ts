import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { answerRecords, answerAiMessages, questions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { askQuizQuestion } from "@/lib/ai/ask-quiz-question";
import { safeJson } from "@/lib/practice/session-state";

const bodySchema = z.object({
  answerRecordId: z.string(),
  question: z.string().min(1).max(500),
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

  const record = db
    .select()
    .from(answerRecords)
    .where(eq(answerRecords.id, body.answerRecordId))
    .get();
  if (!record || record.sessionId !== sessionId) {
    return NextResponse.json({ error: "答题记录不存在" }, { status: 404 });
  }

  const question = db
    .select()
    .from(questions)
    .where(eq(questions.id, record.questionId))
    .get();
  if (!question) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const history = db
    .select()
    .from(answerAiMessages)
    .where(eq(answerAiMessages.answerRecordId, body.answerRecordId))
    .orderBy(answerAiMessages.createdAt)
    .all();

  let answer: string;
  try {
    answer = await askQuizQuestion({
      questionContent: question.content,
      options: safeJson<string[]>(question.options, []),
      correctAnswer: question.answer,
      analysis: question.analysis,
      history: history.map((h) => ({ question: h.question, answer: h.answer })),
      newQuestion: body.question,
    });
  } catch (err) {
    console.error("[ask] LLM 失败：", err);
    return NextResponse.json({ error: "AI 服务暂不可用，请稍后再试" }, { status: 502 });
  }

  if (!answer.trim()) {
    return NextResponse.json({ error: "AI 未返回内容" }, { status: 502 });
  }

  const messageId = uuid();
  const now = Date.now();
  db.insert(answerAiMessages)
    .values({
      id: messageId,
      answerRecordId: body.answerRecordId,
      question: body.question,
      answer,
      createdAt: now,
    })
    .run();

  return NextResponse.json({
    id: messageId,
    question: body.question,
    answer,
    createdAt: now,
  });
}
