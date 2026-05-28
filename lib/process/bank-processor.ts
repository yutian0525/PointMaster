import { db } from "@/lib/db";
import { questionBanks, questions, knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { extractKnowledgePoints } from "@/lib/ai/extract-points";
import { buildKnowledgeGraph } from "@/lib/ai/build-graph";
import { v4 as uuid } from "uuid";

export async function processBankAsync(bankId: string): Promise<void> {
  try {
    await phase1ExtractPoints(bankId);
    await phase2BuildGraph(bankId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    db.update(questionBanks)
      .set({
        status: "failed",
        progressMessage: `处理失败: ${message}`,
        updatedAt: Date.now(),
      })
      .where(eq(questionBanks.id, bankId))
      .run();
  }
}

async function phase1ExtractPoints(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "extracting", progress: 0, progressMessage: "正在提取知识点...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  const allQuestions = db
    .select()
    .from(questions)
    .where(and(eq(questions.bankId, bankId), eq(questions.aiExtracted, 0)))
    .all();

  const total = allQuestions.length;
  let completed = 0;
  let failed = 0;

  for (const q of allQuestions) {
    try {
      const result = await extractKnowledgePoints(bank.name, {
        content: q.content,
        options: JSON.parse(q.options),
        answer: q.answer,
        analysis: q.analysis || undefined,
      });

      db.update(questions)
        .set({
          difficulty: result.difficulty,
          questionType: result.question_type,
          expectedTime: result.expected_time,
          aiExtracted: 1,
          aiKnowledgePoints: JSON.stringify(result.knowledge_points),
        })
        .where(eq(questions.id, q.id))
        .run();
    } catch (error) {
      failed++;
      // Retry once
      try {
        const result = await extractKnowledgePoints(bank.name, {
          content: q.content,
          options: JSON.parse(q.options),
          answer: q.answer,
          analysis: q.analysis || undefined,
        });

        db.update(questions)
          .set({
            difficulty: result.difficulty,
            questionType: result.question_type,
            expectedTime: result.expected_time,
            aiExtracted: 1,
            aiKnowledgePoints: JSON.stringify(result.knowledge_points),
          })
          .where(eq(questions.id, q.id))
          .run();
        failed--;
      } catch {
        // Skip this question
      }
    }

    completed++;
    const progress = Math.round((completed / total) * 70); // Phase 1 = 0-70%
    db.update(questionBanks)
      .set({
        progress,
        progressMessage: `知识点提取中 (${completed}/${total})${failed > 0 ? `，${failed} 题失败` : ""}`,
        updatedAt: Date.now(),
      })
      .where(eq(questionBanks.id, bankId))
      .run();
  }
}

async function phase2BuildGraph(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "building_graph", progress: 75, progressMessage: "正在构建知识图谱...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  // Collect all knowledge point names from extracted questions
  const extractedQuestions = db
    .select()
    .from(questions)
    .where(and(eq(questions.bankId, bankId), eq(questions.aiExtracted, 1)))
    .all();

  const kpCountMap = new Map<string, number>();
  for (const q of extractedQuestions) {
    const points: string[] = JSON.parse(q.aiKnowledgePoints || "[]");
    for (const p of points) {
      kpCountMap.set(p, (kpCountMap.get(p) || 0) + 1);
    }
  }

  const knowledgePointsWithCount = Array.from(kpCountMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));

  if (knowledgePointsWithCount.length === 0) {
    throw new Error("没有提取到任何知识点");
  }

  db.update(questionBanks)
    .set({ progress: 80, progressMessage: "AI 正在分析知识点依赖关系...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  // Call AI to build graph
  const graphResult = await buildKnowledgeGraph(bank.name, knowledgePointsWithCount);

  db.update(questionBanks)
    .set({ progress: 90, progressMessage: "正在写入知识图谱...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  // Create knowledge points in DB
  const nameToId = new Map<string, string>();

  for (const kp of graphResult.knowledge_points) {
    const id = uuid();
    nameToId.set(kp.name, id);
    db.insert(knowledgePoints)
      .values({
        id,
        bankId,
        name: kp.name,
        description: kp.description,
        prerequisiteIds: "[]",
        createdAt: Date.now(),
      })
      .run();
  }

  // Update prerequisite_ids with actual IDs
  for (const kp of graphResult.knowledge_points) {
    const id = nameToId.get(kp.name);
    if (!id) continue;
    const prereqIds = kp.prerequisites
      .map((name) => nameToId.get(name))
      .filter((id): id is string => !!id);
    db.update(knowledgePoints)
      .set({ prerequisiteIds: JSON.stringify(prereqIds) })
      .where(eq(knowledgePoints.id, id))
      .run();
  }

  // Create question_knowledge associations
  for (const q of extractedQuestions) {
    const points: string[] = JSON.parse(q.aiKnowledgePoints || "[]");
    for (let i = 0; i < points.length; i++) {
      const kpId = nameToId.get(points[i]);
      if (!kpId) continue;
      db.insert(questionKnowledge)
        .values({
          id: uuid(),
          questionId: q.id,
          knowledgePointId: kpId,
          isPrimary: i === 0 ? 1 : 0,
        })
        .run();
    }
  }

  // Mark as completed
  db.update(questionBanks)
    .set({
      status: "completed",
      progress: 100,
      progressMessage: `完成！提取了 ${nameToId.size} 个知识点`,
      updatedAt: Date.now(),
    })
    .where(eq(questionBanks.id, bankId))
    .run();
}
