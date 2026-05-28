import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { UploadStrip } from "@/components/banks/upload-strip";
import { BankCard } from "@/components/banks/bank-card";

export const dynamic = "force-dynamic";

export default function BanksPage() {
  const banks = db.select().from(questionBanks).orderBy(desc(questionBanks.createdAt)).all();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-[38px] pt-[30px] flex-shrink-0">
        <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-primary-dark mb-1">
          题库管理
        </div>
        <div className="font-display text-[26px] font-semibold text-foreground tracking-tight leading-tight">
          我的题库
        </div>
        <div className="mt-1 text-[13.5px] text-text-muted">
          管理、上传题库，点击题库可查看详情与知识图谱
        </div>
      </div>

      <div className="flex-1 px-[38px] py-6 overflow-y-auto">
        <UploadStrip />

        {banks.length > 0 && (
          <>
            <div className="font-display text-[16px] font-semibold text-foreground tracking-tight mb-3.5 mt-6">
              全部题库（{banks.length}）
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3.5">
              {banks.map((bank) => (
                <BankCard key={bank.id} bank={bank} />
              ))}
            </div>
          </>
        )}

        {banks.length === 0 && (
          <div className="text-center py-20 text-text-muted text-[14px]">
            还没有题库，点击上方上传你的第一个题库
          </div>
        )}
      </div>
    </div>
  );
}
