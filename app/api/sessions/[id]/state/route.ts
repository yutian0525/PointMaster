import { NextResponse } from "next/server";
import { buildQuizPayload } from "@/lib/practice/session-state";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const payload = buildQuizPayload(id);
  if (!payload) {
    return NextResponse.json({ error: "session 不存在" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
