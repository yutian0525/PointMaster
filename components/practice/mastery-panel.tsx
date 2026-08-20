import type { MasteryState, QuizPayload } from "@/lib/practice/types";
import {
  COMPLETION_CONFIDENCE_THRESHOLD,
  COMPLETION_MASTERY_THRESHOLD,
} from "@/lib/practice/completion";

interface Props {
  payload: QuizPayload;
}

export function MasteryPanel({ payload }: Props) {
  const { mastery, knowledgePoints, currentKp, overview } = payload;
  const currentItem = knowledgePoints.find((k) => k.status === "current");

  return (
    <aside className="border-l border-border bg-white/55 backdrop-blur-sm overflow-y-auto px-[22px] py-[26px]">
      <Section title="当前知识点" badge="算法实时">
        <div className="font-display text-[19px] font-semibold text-foreground mb-1">
          {currentKp?.name ?? "—"}
        </div>
        <div className="text-[11.5px] text-text-muted mb-[18px]">
          已做 {currentItem?.answeredCount ?? 0} 题 · 本轮正确率{" "}
          {Math.round((currentItem?.correctRate ?? 0) * 100)}%
        </div>
        <Gauge
          label="掌握度 mastery"
          value={mastery.mastery}
          colorClass="bg-gradient-to-r from-primary to-primary-dark"
          valueColor="text-primary-dark"
          threshold={COMPLETION_MASTERY_THRESHOLD}
        />
        <Gauge
          label="置信度 confidence"
          value={mastery.confidence}
          colorClass="bg-gradient-to-r from-[#9bb3d4] to-[#6f8db5]"
          valueColor="text-[#6f8db5]"
          threshold={COMPLETION_CONFIDENCE_THRESHOLD}
        />
        <StreakBox mastery={mastery} />
      </Section>

      <div className="mt-[26px]">
        <Section title="全题库掌握概览">
          <div className="flex flex-col gap-[13px]">
            {overview.map((row) => {
              const pct = Math.round(row.mastery * 100);
              const isCurrent = currentKp?.id === row.kpId;
              return (
                <div key={row.kpId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-[12.5px] font-semibold flex items-center gap-1.5 ${
                        isCurrent ? "text-foreground" : "text-text-secondary"
                      }`}
                    >
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-dark shadow-[0_0_0_3px_rgba(159,185,151,0.25)]" />
                      )}
                      {row.name}
                    </span>
                    <span className="text-[11.5px] font-bold text-text-muted">{pct}%</span>
                  </div>
                  <div className="h-[5px] bg-background-alt rounded-[10px] overflow-hidden">
                    <div
                      className={`h-full rounded-[10px] ${
                        row.mastery >= 0.6
                          ? "bg-gradient-to-r from-primary to-primary-dark"
                          : "bg-gradient-to-r from-primary-light to-primary"
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-extrabold tracking-[0.13em] uppercase text-text-muted mb-3.5 flex items-center gap-1.5">
        {title}
        {badge && (
          <span className="ml-auto text-[9px] font-bold text-primary-dark bg-[rgba(159,185,151,0.16)] px-1.5 py-0.5 rounded-[20px] tracking-[0.04em]">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Gauge({
  label,
  value,
  colorClass,
  valueColor,
  threshold,
}: {
  label: string;
  value: number;
  colorClass: string;
  valueColor: string;
  threshold?: number;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-text-secondary">{label}</span>
        <span className={`font-display text-[17px] font-semibold ${valueColor}`}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-background-alt rounded-[10px] overflow-hidden relative">
        <div
          className={`absolute inset-y-0 left-0 rounded-[10px] transition-[width] duration-700 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
        {threshold !== undefined && (
          <span
            className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-[#c89a3f] opacity-70"
            style={{ left: `${Math.round(threshold * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function StreakBox({ mastery }: { mastery: MasteryState }) {
  const streak = mastery.streak;
  let label: string;
  let emoji = "🔥";
  if (streak > 0) label = `连续答对 ${streak} 题`;
  else if (streak < 0) {
    label = `连续答错 ${-streak} 题`;
    emoji = "💧";
  } else label = "尚未开始";
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-md bg-gradient-to-br from-[rgba(200,154,63,0.1)] to-[rgba(159,185,151,0.08)] border border-border">
      <span className="text-[22px] leading-none">{emoji}</span>
      <div className="text-[12px] text-text-secondary">
        {label}
        <br />
        <span className="text-[11px] text-text-muted">
          mastery 达 0.80 且 confidence ≥ 0.70 即完成
        </span>
      </div>
    </div>
  );
}
