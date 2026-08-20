import { db } from "@/lib/db";
import {
  practiceSessions,
  questionBanks,
  answerRecords,
  userMastery,
} from "@/lib/db/schema";
import { and, avg, count, countDistinct, eq, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { safeJson } from "@/lib/practice/session-state";
import type { OrderedKnowledgePoint } from "@/lib/practice/types";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, sessionId))
    .get();
  if (!session) notFound();

  const bank = db
    .select()
    .from(questionBanks)
    .where(eq(questionBanks.id, session.bankId))
    .get();
  if (!bank) notFound();

  const order: OrderedKnowledgePoint[] = safeJson(session.knowledgePointOrder, []);
  const snapshot: Record<string, { mastery: number; confidence: number }> = safeJson(
    session.kpMasterySnapshot,
    {}
  );

  // 汇总统计
  const totalAnswered = db
    .select({ cnt: count() })
    .from(answerRecords)
    .where(eq(answerRecords.sessionId, sessionId))
    .get();

  const avgScore = db
    .select({ avg: avg(answerRecords.score) })
    .from(answerRecords)
    .where(eq(answerRecords.sessionId, sessionId))
    .get();

  const wrongRedoKps = db
    .select({ cnt: countDistinct(answerRecords.knowledgePointId) })
    .from(answerRecords)
    .where(
      and(
        eq(answerRecords.sessionId, sessionId),
        eq(answerRecords.mode, "wrong-redo")
      )
    )
    .get();

  const answeredCount = Number(totalAnswered?.cnt ?? 0);
  const correctRate = Math.round(Number(avgScore?.avg ?? 0) * 100);
  const wrongRedoCount = Number(wrongRedoKps?.cnt ?? 0);

  // 每个 KP 当前 mastery
  const masteryRows = db
    .select()
    .from(userMastery)
    .where(eq(userMastery.bankId, session.bankId))
    .all();
  const masteryMap = new Map(masteryRows.map((r) => [r.knowledgePointId, r]));

  // 已完成 KP 数（mastery >= 0.8，截止到 currentKpIndex）
  const practicedOrder = order.slice(0, session.currentKpIndex + 1);
  const completedKpCount = practicedOrder.filter((k) => {
    const m = masteryMap.get(k.id);
    return m && m.mastery >= 0.8;
  }).length;

  // 用时
  const durationMs =
    session.endedAt && session.startedAt
      ? session.endedAt - session.startedAt
      : null;
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null;

  // 每个 KP mastery 变化
  const kpStats = order.map((k) => {
    const cur = masteryMap.get(k.id);
    const prev = snapshot[k.id];
    const curMastery = cur?.mastery ?? 0;
    const prevMastery = prev?.mastery ?? 0;
    const delta = curMastery - prevMastery;
    const isPracticed = !!cur && cur.testedCount > 0;
    return {
      id: k.id,
      name: k.name,
      mastery: curMastery,
      prevMastery,
      delta,
      isPracticed,
    };
  });

  // 薄弱知识点 mastery < 0.5
  const weakKps = kpStats.filter((k) => k.mastery < 0.5);

  const startDate = new Date(session.startedAt).toLocaleDateString("zh-CN");

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-[920px] mx-auto px-10 pt-[42px] pb-[70px]">
        {/* Header */}
        <div className="text-center mb-[38px]">
          <div className="text-[10.5px] font-extrabold tracking-[0.16em] uppercase text-primary-dark flex items-center justify-center gap-2 mb-3">
            Step 03 — 本次练习总结
          </div>
          <h1 className="font-display text-[36px] font-medium tracking-[-0.03em]">
            你的<em className="italic text-primary-dark">掌握度报告</em>
          </h1>
          <p className="mt-2.5 text-[13.5px] text-text-muted">
            {bank.name} · {startDate}
            {durationMin !== null ? ` · 用时 ${durationMin} 分钟` : ""}
          </p>
        </div>

        {/* 统计卡 */}
        <div className="grid grid-cols-4 gap-4 mb-[34px]">
          <StatCard value={String(answeredCount)} label="本次答题" />
          <StatCard value={`${correctRate}%`} label="整体正确率" />
          <StatCard value={String(completedKpCount)} label="完成知识点" />
          <StatCard value={String(wrongRedoCount)} label="错题重刷轮次" />
        </div>

        {/* 掌握度变化 */}
        <div className="bg-white border border-border rounded-[22px] px-7 pt-[26px] pb-7 shadow-sm mb-[22px]">
          <h3 className="font-display text-[18px] font-semibold mb-5 flex items-center gap-2.5">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6b8c64" strokeWidth="2">
              <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
            </svg>
            知识点掌握度变化
          </h3>
          <div className="flex flex-col gap-[18px]">
            {kpStats.map((k) => {
              const pct = Math.round(k.mastery * 100);
              const prevPct = Math.round(k.prevMastery * 100);
              const deltaPct = Math.round(k.delta * 100);
              return (
                <div key={k.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[14px] font-semibold text-foreground">{k.name}</span>
                    <div className="flex items-center gap-2.5 text-[12px]">
                      {k.isPracticed ? (
                        <span
                          className={`font-bold px-2 py-0.5 rounded-[20px] text-[11px] ${
                            deltaPct > 0
                              ? "bg-[rgba(159,185,151,0.18)] text-primary-dark"
                              : "bg-background-alt text-text-muted"
                          }`}
                        >
                          {deltaPct > 0 ? `↑ +${deltaPct}%` : deltaPct < 0 ? `↓ ${deltaPct}%` : "— 持平"}
                        </span>
                      ) : (
                        <span className="font-bold px-2 py-0.5 rounded-[20px] text-[11px] bg-background-alt text-text-muted">
                          — 未练
                        </span>
                      )}
                      <span className="font-display text-[15px] font-semibold text-foreground min-w-[38px] text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-background-alt rounded-[10px] overflow-hidden relative">
                    {/* ghost = 起始值 */}
                    {prevPct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-[10px] bg-[rgba(159,185,151,0.25)]"
                        style={{ width: `${prevPct}%` }}
                      />
                    )}
                    <div
                      className={`absolute inset-y-0 left-0 rounded-[10px] transition-[width] duration-700 ${
                        k.mastery >= 0.5
                          ? "bg-gradient-to-r from-primary to-primary-dark"
                          : "bg-gradient-to-r from-[#d8b97a] to-[#c89a3f]"
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 薄弱知识点 */}
        {weakKps.length > 0 && (
          <div className="bg-white border border-border rounded-[22px] px-7 pt-[26px] pb-7 shadow-sm mb-[22px]">
            <h3 className="font-display text-[18px] font-semibold mb-5 flex items-center gap-2.5">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8a6510" strokeWidth="2">
                <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
              仍需加强的知识点
            </h3>
            <div className="flex flex-col gap-2.5">
              {weakKps.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-md bg-[rgba(200,154,63,0.1)] border border-[rgba(200,154,63,0.22)]"
                >
                  <div className="w-[30px] h-[30px] rounded-[9px] bg-[rgba(200,154,63,0.2)] grid place-items-center flex-shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a6510" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <b className="block text-[13.5px] font-semibold text-foreground">{k.name}</b>
                    <span className="text-[11.5px] text-[#8a6510]">
                      掌握度 {Math.round(k.mastery * 100)}%
                      {!k.isPracticed ? " · 尚未开始，建议下次优先" : " · 建议结合错题重刷巩固"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="flex gap-3.5 justify-center mt-8">
          <Link
            href={`/practice/new?bankId=${session.bankId}`}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md text-[14.5px] font-bold bg-background border border-border-strong text-text-secondary hover:bg-white hover:text-foreground hover:border-primary transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            再次刷题
          </Link>
          <Link
            href="/banks"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-md text-[14.5px] font-bold text-white bg-gradient-to-br from-primary to-primary-dark shadow-md hover:-translate-y-0.5 transition-all"
          >
            返回题库
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white border border-border rounded-[22px] py-5 text-center shadow-sm">
      <b className="block font-display text-[30px] font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </b>
      <span className="text-[11.5px] text-text-muted font-semibold">{label}</span>
    </div>
  );
}
