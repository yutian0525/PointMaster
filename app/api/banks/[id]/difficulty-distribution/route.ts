import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const allQuestions = db
    .select({ difficulty: questions.difficulty })
    .from(questions)
    .where(eq(questions.bankId, id))
    .all();

  const buckets: Record<string, number> = {
    "0.0-0.2": 0,
    "0.2-0.4": 0,
    "0.4-0.6": 0,
    "0.6-0.8": 0,
    "0.8-1.0": 0,
    "未标注": 0,
  };

  for (const q of allQuestions) {
    if (q.difficulty == null) {
      buckets["未标注"]++;
    } else if (q.difficulty < 0.2) {
      buckets["0.0-0.2"]++;
    } else if (q.difficulty < 0.4) {
      buckets["0.2-0.4"]++;
    } else if (q.difficulty < 0.6) {
      buckets["0.4-0.6"]++;
    } else if (q.difficulty < 0.8) {
      buckets["0.6-0.8"]++;
    } else {
      buckets["0.8-1.0"]++;
    }
  }

  const distribution = Object.entries(buckets).map(([range, count]) => ({
    range,
    count,
  }));

  return NextResponse.json({ distribution });
}
