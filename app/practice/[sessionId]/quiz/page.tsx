import { db } from "@/lib/db";
import { practiceSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { buildQuizPayload } from "@/lib/practice/session-state";
import { QuizClient } from "@/components/practice/quiz-client";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.id, sessionId))
    .get();
  if (!session) notFound();
  if (session.status !== "active") {
    redirect(`/practice/${sessionId}/report`);
  }
  const payload = buildQuizPayload(sessionId);
  if (!payload) notFound();
  return <QuizClient initialPayload={payload} />;
}
