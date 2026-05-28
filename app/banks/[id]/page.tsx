import { db } from "@/lib/db";
import { questionBanks, knowledgePoints } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BankDetailClient } from "@/components/banks/bank-detail-client";

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
            <div className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">
              📐 {bank.name}
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
      </div>

      <BankDetailClient bankId={id} initialBank={initialBank} />
    </div>
  );
}
