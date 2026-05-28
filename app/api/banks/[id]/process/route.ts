import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processBankAsync } from "@/lib/process/bank-processor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, id)).get();

  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  if (bank.status === "extracting" || bank.status === "building_graph") {
    return NextResponse.json({ error: "题库正在处理中" }, { status: 409 });
  }

  // Fire and forget — don't await
  processBankAsync(id);

  return NextResponse.json({ status: "started" }, { status: 202 });
}
