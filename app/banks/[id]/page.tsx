import { db } from "@/lib/db";
import {
  questionBanks,
  knowledgePoints,
  practiceSessions,
  answerRecords,
} from "@/lib/db/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BankDetailClient } from "@/components/banks/bank-detail-client";
import { ResumeBanner } from "@/components/practice/resume-banner";
import { safeJson } from "@/lib/practice/session-state";
import type { OrderedKnowledgePoint } from "@/lib/practice/types";

export const dynamic = "force-dynamic";

export default async function BankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, id)).get();

  if (!bank) {
    notFound();
  }

  const kpCount = db
    .select({ count: count() })
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, id))
    .get();

  const initialBank = {
    ...bank,
    knowledgePointCount: kpCount?.count || 0,
  };

  // 查活跃 session（ResumeBanner）
  const activeSession = db
    .select()
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.bankId, id),
        eq(practiceSessions.status, "active")
      )
    )
    .limit(1)
    .get();

  let resumeProps: {
    sessionId: string;
    bankId: string;
    bankName: string;
    currentKpName: string;
    answeredCount: number;
    totalQuestions: number;
  } | null = null;

  if (activeSession) {
    const order: OrderedKnowledgePoint[] = safeJson(
      activeSession.knowledgePointOrder,
      []
    );
    const currentKp = order[activeSession.currentKpIndex];
    if (currentKp) {
      const answeredRow = db
        .select({ cnt: sql<number>`count(distinct ${answerRecords.questionId})`.as("cnt") })
        .from(answerRecords)
        .where(
          and(
            eq(answerRecords.sessionId, activeSession.id),
            eq(answerRecords.knowledgePointId, currentKp.id)
          )
        )
        .get();
      resumeProps = {
        sessionId: activeSession.id,
        bankId: id,
        bankName: bank.name,
        currentKpName: currentKp.name,
        answeredCount: Number(answeredRow?.cnt ?? 0),
        totalQuestions: currentKp.totalQuestions,
      };
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-[38px] pt-[30px] flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2.5 text-[10.5px] font-bold tracking-[0.1em] uppercase text-primary-dark mb-2">
          <Link
            href="/banks"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium text-primary-dark hover:bg-[rgba(159,185,151,0.1)] transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            题库管理
          </Link>
          <span className="text-border-strong">／</span>
          <span>{bank.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-5 mt-2">
          <div>
            <div className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight flex items-center gap-2">
              <svg className="w-6 h-6 text-primary-dark flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 20h20" />
                <path d="M5 20V8l7-5 7 5v12" />
                <path d="M9 20v-6h6v6" />
              </svg>
              {bank.name}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
                {bank.totalQuestions} 题
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
                {kpCount?.count || 0} 知识点
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,165,110,0.18)] text-[#7a5820]">
                导入 {new Date(bank.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
        </div>
        {resumeProps && <ResumeBanner {...resumeProps} />}
      </div>

      <BankDetailClient bankId={id} initialBank={initialBank} />
    </div>
  );
}
