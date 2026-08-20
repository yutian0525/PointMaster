import type { QuizKpItem } from "@/lib/practice/types";

interface KpPillProps {
  kp: QuizKpItem;
}

function masteryClass(kp: QuizKpItem): { label: string; cls: string } {
  if (kp.answeredCount === 0 && kp.mastery === 0) {
    return { label: "—", cls: "bg-background-alt text-text-muted" };
  }
  const pct = Math.round(kp.mastery * 100);
  if (kp.mastery >= 0.8) return { label: `${pct}%`, cls: "bg-[rgba(159,185,151,0.2)] text-primary-dark" };
  if (kp.mastery >= 0.5) return { label: `${pct}%`, cls: "bg-[rgba(200,154,63,0.14)] text-[#8a6510]" };
  return { label: `${pct}%`, cls: "bg-[rgba(201,120,120,0.13)] text-[#a83c3c]" };
}

export function KpPill({ kp }: KpPillProps) {
  const m = masteryClass(kp);
  const isCurrent = kp.status === "current";
  const isDone = kp.status === "done";

  return (
    <div
      className={`flex-shrink-0 flex items-center gap-2.5 px-3 h-8 rounded-[18px] border transition-all ${
        isCurrent
          ? "bg-gradient-to-br from-white to-[rgba(159,185,151,0.1)] border-primary shadow-sm"
          : isDone
          ? "bg-[rgba(159,185,151,0.1)] border-border-strong"
          : "bg-white border-border opacity-60"
      }`}
      data-current={isCurrent || undefined}
    >
      {isCurrent && (
        <span className="w-[5px] h-[5px] flex-shrink-0 rounded-full bg-primary-dark shadow-[0_0_0_3px_rgba(159,185,151,0.2)]" />
      )}
      <span
        className={`text-[12px] font-bold whitespace-nowrap ${
          isDone || isCurrent ? "text-foreground" : "text-text-secondary"
        }`}
      >
        {kp.name}
      </span>
      <span className="font-display text-[11.5px] text-text-muted whitespace-nowrap">
        <b className={`font-semibold ${isDone || isCurrent ? "text-foreground" : "text-text-muted"}`}>
          {kp.answeredCount}
        </b>
        /{kp.totalQuestions}
      </span>
      <span
        className={`text-[11px] font-bold py-0.5 px-2 rounded-[20px] whitespace-nowrap ${m.cls}`}
      >
        {m.label}
      </span>
      {isDone && (
        <svg className="w-[13px] h-[13px] text-primary-dark flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </div>
  );
}
