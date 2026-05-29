import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { microLearnings } from "@/lib/db/schema";

const PositionSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
});

const PatchSchema = z.object({
  positions: z.array(PositionSchema).max(100),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = db.select({ id: microLearnings.id }).from(microLearnings).where(eq(microLearnings.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  db.update(microLearnings)
    .set({
      cardPositions: JSON.stringify(parsed.data.positions),
      updatedAt: Date.now(),
    })
    .where(eq(microLearnings.id, id))
    .run();

  return NextResponse.json({ ok: true });
}
