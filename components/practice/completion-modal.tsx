"use client";

import type { QuizPayload } from "@/lib/practice/types";

interface Props {
  open: boolean;
  payload: QuizPayload;
  hasWrongInPrev: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: (action: "redo" | "wrong-redo" | "next-kp") => void;
}

export function CompletionModal({
  open,
  payload,
  hasWrongInPrev,
  busy,
  onClose,
  onAction,
}: Props) {
  if (!open) return null;
  const currentItem = payload.knowledgePoints.find((k) => k.status === "current");
  const nextItem = payload.knowledgePoints.find((k) => k.status === "todo");
  const correctRate = currentItem ? Math.round(currentItem.correctRate * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(30,40,34,0.42)] backdrop-blur-md grid place-items-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[min(560px,100%)] bg-white rounded-[30px] shadow-xl overflow-hidden">
        <div className="px-[34px] pt-[34px] pb-[26px] text-center relative overflow-hidden bg-gradient-to-b from-[rgba(159,185,151,0.16)] to-[rgba(200,212,192,0.08)]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-[20px] bg-gradient-to-br from-primary to-[#4f6b49] grid place-items-center shadow-md">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="font-display text-[25px] font-semibold tracking-tight">
            「{payload.currentKp?.name ?? "—"}」
            <em className="italic text-primary-dark">本轮完成</em>
          </h2>
          <div className="mt-4 flex justify-center gap-[30px]">
            <Stat label="本轮答题" value={String(currentItem?.answeredCount ?? 0)} />
            <Stat label="正确率" value={`${correctRate}%`} />
            <Stat
              label="掌握度"
              value={payload.mastery.mastery.toFixed(2)}
              accent
            />
          </div>
        </div>
        <div className="px-[30px] py-6">
          <p className="text-center text-[13.5px] text-text-secondary mb-[18px]">
            这个知识点接下来想怎么处理？
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Choice
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-3-6.7M21 4v4h-4" />
                </svg>
              }
              iconBg="bg-[rgba(159,185,151,0.18)] text-primary-dark"
              title="重新刷题"
              hint={`全部 ${currentItem?.totalQuestions ?? 0} 题再过一遍`}
              disabled={busy}
              onClick={() => onAction("redo")}
            />
            <Choice
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              }
              iconBg="bg-[rgba(201,120,120,0.13)] text-[#a83c3c]"
              title="错题重刷"
              hint={hasWrongInPrev ? "仅重刷本轮做错的题" : "本轮无错题，无需重刷"}
              disabled={busy || !hasWrongInPrev}
              onClick={() => onAction("wrong-redo")}
            />
            <NextChoice
              hint={
                nextItem
                  ? `按学习路径继续 · ${nextItem.totalQuestions} 题`
                  : "已是最后一个知识点 — 完成并查看报告"
              }
              title={
                nextItem
                  ? `进入下一知识点：${nextItem.name}`
                  : "完成并查看报告"
              }
              disabled={busy}
              onClick={() => onAction("next-kp")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <b className={`block font-display text-[24px] font-semibold ${accent ? "text-primary-dark" : "text-foreground"}`}>
        {value}
      </b>
      <span className="text-[11px] text-text-muted font-semibold tracking-[0.03em]">{label}</span>
    </div>
  );
}

function Choice({
  icon,
  iconBg,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left p-4 rounded-md border-[1.5px] border-border bg-background hover:border-primary hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
    >
      <div className={`w-[34px] h-[34px] rounded-[10px] grid place-items-center mb-2.5 ${iconBg}`}>
        <div className="w-[18px] h-[18px]">{icon}</div>
      </div>
      <b className="block text-[14px] font-bold text-foreground">{title}</b>
      <span className="block text-[11.5px] text-text-muted mt-0.5">{hint}</span>
    </button>
  );
}

function NextChoice({
  title,
  hint,
  onClick,
  disabled,
}: {
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="col-span-2 flex items-center gap-3.5 p-4 rounded-md bg-gradient-to-br from-primary to-primary-dark text-white shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
    >
      <div className="w-[34px] h-[34px] rounded-[10px] bg-white/20 grid place-items-center flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
      <div className="text-left">
        <b className="block text-[14px] font-bold text-white">{title}</b>
        <span className="block text-[11.5px] text-white/80 mt-0.5">{hint}</span>
      </div>
    </button>
  );
}
