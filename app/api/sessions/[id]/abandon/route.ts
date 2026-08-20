import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { practiceSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, id))
    .get();
  if (!session) {
    return NextResponse.json({ error: "session 不存在" }, { status: 404 });
  }
  const now = Date.now();
  db.update(practiceSessions)
    .set({ status: "abandoned", endedAt: now, updatedAt: now })
    .where(eq(practiceSessions.id, id))
    .run();
  return NextResponse.json({ ok: true });
}
