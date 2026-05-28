import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const bank = db
    .select({
      status: questionBanks.status,
      progress: questionBanks.progress,
      progressMessage: questionBanks.progressMessage,
    })
    .from(questionBanks)
    .where(eq(questionBanks.id, id))
    .get();

  if (!bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 });
  }

  return NextResponse.json(bank);
}
