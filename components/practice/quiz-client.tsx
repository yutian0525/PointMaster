"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KpStrip } from "./kp-strip";
import { OptionList } from "./option-list";
import { RevealBanner } from "./reveal-banner";
import { AnalysisCard } from "./analysis-card";
import { AskThread } from "./ask-thread";
import { MasteryPanel } from "./mastery-panel";
import { CompletionModal } from "./completion-modal";
import type {
  QuestionTypeName,
  QuizCurrentQuestion,
  QuizPayload,
  SubmitAnswerResponse,
} from "@/lib/practice/types";

interface NextQuestionResp {
  question: {
    id: string;
    content: string;
    options: string[];
    questionType: QuestionTypeName;
    difficulty: number;
    expectedTime: number;
  } | null;
  completionTriggered: boolean;
}

export function QuizClient({ initialPayload }: { initialPayload: QuizPayload }) {
  const router = useRouter();
  const [payload, setPayload] = useState<QuizPayload>(initialPayload);
  const [selected, setSelected] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWrongInPrev, setHasWrongInPrev] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const sessionId = payload.session.id;
  const current = payload.currentQuestion;
  const submitted = current?.submitted;

  // 题目变更后重置状态
  useEffect(() => {
    setSelected("");
    startedAtRef.current = Date.now();
  }, [current?.id]);

  // 顶部菜单激活态
  useEffect(() => {
    if (payload.session.status === "completed") {
      router.push(`/practice/${sessionId}/report`);
    }
  }, [payload.session.status, sessionId, router]);

  function applyKpProgress(
    next: QuizPayload,
    kpProgress: SubmitAnswerResponse["kpProgress"]
  ): QuizPayload {
    return {
      ...next,
      knowledgePoints: next.knowledgePoints.map((k) =>
        k.status === "current"
          ? { ...k, answeredCount: kpProgress.answeredCount, correctRate: kpProgress.correctRate }
          : k
      ),
    };
  }

  async function submitAnswer() {
    if (!current || submitting) return;
    if (!selected.trim()) {
      setError("请先选择一个答案");
      return;
    }
    setSubmitting(true);
    setError(null);
    const timeSpent = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit-answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: current.id,
          userAnswer: selected,
          timeSpent,
        }),
      });
      const data = (await res.json()) as SubmitAnswerResponse | { error: string };
      if (!res.ok || !("score" in data)) {
        setError("error" in data ? data.error : "提交失败");
        return;
      }
      // 用响应数据合并到 payload，不重新拉接口
      setPayload((prev) => {
        const updated: QuizPayload = {
          ...prev,
          currentQuestion: {
            ...current,
            submitted: {
              score: data.score,
              correctAnswer: data.correctAnswer,
              analysis: data.analysis,
              answerRecordId: data.answerRecordId,
              aiMessages: [],
            },
          },
          mastery: data.mastery,
          overview: prev.overview.map((row) =>
            row.kpId === prev.currentKp?.id ? { ...row, mastery: data.mastery.mastery } : row
          ),
        };
        return applyKpProgress(updated, data.kpProgress);
      });
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadNextQuestion() {
    setLoadingNext(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/next-question`);
      const data = (await res.json()) as NextQuestionResp;
      if (!res.ok) {
        setError("加载下一题失败");
        return;
      }
      if (data.completionTriggered) {
        // 检查是否有错题，决定 wrong-redo 是否可点
        try {
          const r = await fetch(`/api/sessions/${sessionId}/wrong-count`);
          if (r.ok) {
            const j = (await r.json()) as { count: number };
            setHasWrongInPrev(j.count > 0);
          } else {
            setHasWrongInPrev(false);
          }
        } catch {
          setHasWrongInPrev(false);
        }
        setCompletionOpen(true);
        return;
      }
      const q = data.question;
      if (!q) {
        setCompletionOpen(true);
        return;
      }
      const nextQuestion: QuizCurrentQuestion = {
        id: q.id,
        content: q.content,
        options: q.options,
        questionType: q.questionType,
        difficulty: q.difficulty,
        expectedTime: q.expectedTime,
      };
      setPayload((prev) => ({ ...prev, currentQuestion: nextQuestion }));
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoadingNext(false);
    }
  }

  async function advance(action: "redo" | "wrong-redo" | "next-kp" | "skip") {
    setAdvancing(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "推进失败");
        return;
      }
      const newPayload = data as QuizPayload;
      setPayload(newPayload);
      setCompletionOpen(false);
      if (newPayload.session.status === "completed") {
        // finish session 并跳报告
        await fetch(`/api/sessions/${sessionId}/finish`, { method: "POST" });
        router.push(`/practice/${sessionId}/report`);
      }
    } catch {
      setError("网络异常，请重试");
    } finally {
      setAdvancing(false);
    }
  }

  async function finishSession() {
    await fetch(`/api/sessions/${sessionId}/finish`, { method: "POST" });
    router.push(`/practice/${sessionId}/report`);
  }

  return (
    <div className="grid grid-rows-[auto_1fr] h-full">
      <KpStrip kps={payload.knowledgePoints} />
      <div className="grid grid-cols-[1fr_320px] xl:grid-cols-[1fr_320px] lg:grid-cols-[1fr_280px] overflow-hidden">
        <div className="overflow-y-auto px-[46px] pt-[34px] pb-[60px]">
          <div className="max-w-[680px] mx-auto">
            <TopBar
              kpName={payload.currentKp?.name ?? ""}
              currentMode={payload.session.currentMode}
              roundIndex={payload.session.currentRoundIndex}
              onFinish={finishSession}
            />

            {!current && !loadingNext && (
              <EmptyQuestion onLoad={loadNextQuestion} />
            )}

            {current && (
              <>
                <QuestionMeta
                  index={payload.knowledgePoints.find((k) => k.status === "current")?.answeredCount ?? 0}
                  questionType={current.questionType}
                  difficulty={current.difficulty}
                />
                <h2 className="text-[20px] font-medium leading-[1.55] tracking-[-0.01em] mb-[26px] text-foreground whitespace-pre-wrap">
                  {current.content}
                </h2>
                <OptionList
                  options={current.options}
                  questionType={current.questionType}
                  selected={selected}
                  onChange={setSelected}
                  submitted={submitted}
                  userAnswer={submitted ? selected : selected}
                />

                {!submitted && (
                  <div className="mt-7 flex items-center gap-3">
                    <Timer expectedTime={current.expectedTime} />
                    <div className="flex-1" />
                    <button
                      onClick={() => advance("skip")}
                      disabled={submitting || advancing}
                      className="px-[22px] py-2.5 rounded-md text-[13.5px] font-bold bg-background border border-border-strong text-text-secondary hover:bg-white hover:text-foreground hover:border-primary disabled:opacity-50 transition-all"
                    >
                      跳过
                    </button>
                    <button
                      onClick={submitAnswer}
                      disabled={submitting || !selected}
                      className="px-[22px] py-2.5 rounded-md text-[13.5px] font-bold text-white bg-gradient-to-br from-primary to-primary-dark shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      {submitting ? "提交中…" : "提交答案"}
                    </button>
                  </div>
                )}

                {submitted && (
                  <div className="mt-6">
                    <RevealBanner
                      score={submitted.score}
                      correctAnswer={submitted.correctAnswer}
                      kpName={payload.currentKp?.name}
                    />
                    <AnalysisCard analysis={submitted.analysis} />
                    <AskThread
                      sessionId={sessionId}
                      answerRecordId={submitted.answerRecordId}
                      initialMessages={submitted.aiMessages}
                    />
                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        onClick={loadNextQuestion}
                        disabled={loadingNext || advancing}
                        className="inline-flex items-center gap-2 px-[22px] py-2.5 rounded-md text-[13.5px] font-bold text-white bg-gradient-to-br from-primary to-primary-dark shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                      >
                        {loadingNext ? "加载中…" : "下一题"}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="mt-4 px-3 py-2 rounded-md text-[12.5px] bg-[rgba(201,120,120,0.13)] text-[#a83c3c]">
                {error}
              </div>
            )}
          </div>
        </div>
        <MasteryPanel payload={payload} />
      </div>

      <CompletionModal
        open={completionOpen}
        payload={payload}
        hasWrongInPrev={hasWrongInPrev}
        busy={advancing}
        onClose={() => setCompletionOpen(false)}
        onAction={(action) => advance(action)}
      />
    </div>
  );
}

function TopBar({
  kpName,
  currentMode,
  roundIndex,
  onFinish,
}: {
  kpName: string;
  currentMode: string;
  roundIndex: number;
  onFinish: () => void;
}) {
  const modeLabel = useMemo(() => {
    if (currentMode === "redo") return `· 重新刷题 第 ${roundIndex} 轮`;
    if (currentMode === "wrong-redo") return `· 错题重刷 第 ${roundIndex} 轮`;
    return "";
  }, [currentMode, roundIndex]);
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="text-[10.5px] font-extrabold tracking-[0.16em] uppercase text-primary-dark">
        当前知识点 — {kpName} {modeLabel}
      </div>
      <button
        onClick={onFinish}
        className="text-[12px] text-text-muted hover:text-foreground transition-colors"
      >
        结束并查看报告
      </button>
    </div>
  );
}

function QuestionMeta({
  index,
  questionType,
  difficulty,
}: {
  index: number;
  questionType: QuestionTypeName;
  difficulty: number;
}) {
  const dots = 5;
  const lit = Math.max(1, Math.round(difficulty * dots));
  const level = difficulty < 0.34 ? "易" : difficulty < 0.67 ? "中" : "难";
  return (
    <div className="flex items-center gap-2.5 mb-[22px]">
      <span className="font-display text-[13px] font-semibold text-primary-dark bg-[rgba(159,185,151,0.16)] px-3 py-1 rounded-[30px]">
        第 {index + 1} 题
      </span>
      <span className="text-[11px] font-bold tracking-[0.04em] text-text-muted border border-border px-2.5 py-0.5 rounded-[30px]">
        {questionType}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {Array.from({ length: dots }).map((_, i) => (
          <i
            key={i}
            className={`w-[7px] h-[7px] rounded-full ${
              i < lit ? "bg-[#c89a3f]" : "bg-background-alt"
            }`}
          />
        ))}
        <span className="text-[11px] text-text-muted ml-1">难度 {level}</span>
      </div>
    </div>
  );
}

function Timer({ expectedTime }: { expectedTime: number }) {
  return (
    <div className="text-[12px] text-text-muted flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2M9 2h6" />
      </svg>
      建议用时 {expectedTime}s
    </div>
  );
}

function EmptyQuestion({ onLoad }: { onLoad: () => void }) {
  return (
    <div className="bg-white border border-border rounded-md p-6 text-center mt-6">
      <div className="font-display text-[16px] font-semibold mb-2">
        当前没有可作答的题目
      </div>
      <div className="text-[12.5px] text-text-muted mb-4">
        点击下方按钮加载下一题，若题池已耗尽将弹出完成选择。
      </div>
      <button
        onClick={onLoad}
        className="inline-flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold text-white bg-gradient-to-br from-primary to-primary-dark shadow-md"
      >
        加载下一题
      </button>
    </div>
  );
}
