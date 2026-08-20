import { db } from "@/lib/db";
import { questionBanks, knowledgePoints } from "@/lib/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { PlanClient, type PlanBankOption } from "@/components/practice/plan-client";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ bankId?: string }>;
}) {
  const sp = await searchParams;

  const allBanks = db
    .select()
    .from(questionBanks)
    .orderBy(desc(questionBanks.createdAt))
    .all();

  const usable: PlanBankOption[] = [];
  for (const b of allBanks) {
    if (b.status !== "completed") continue;
    const c = db
      .select({ cnt: count() })
      .from(knowledgePoints)
      .where(eq(knowledgePoints.bankId, b.id))
      .get();
    if ((c?.cnt ?? 0) === 0) continue;
    usable.push({
      id: b.id,
      name: b.name,
      totalQuestions: b.totalQuestions,
      knowledgePointCount: c?.cnt ?? 0,
      createdAt: b.createdAt,
    });
  }

  const initialBankId = sp.bankId && usable.some((b) => b.id === sp.bankId) ? sp.bankId : usable[0]?.id ?? null;

  return <PlanClient banks={usable} initialBankId={initialBankId} />;
}
