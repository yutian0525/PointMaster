import { db } from "@/lib/db";
import { questionBanks, questions, knowledgePoints, questionKnowledge } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { classifyQuestion } from "@/lib/ai/extract-points";
import { buildKnowledgeGraph } from "@/lib/ai/build-graph";
import { v4 as uuid } from "uuid";

export async function processBankAsync(bankId: string): Promise<void> {
  try {
    await phase1BuildGraph(bankId);
    await phase2ClassifyQuestions(bankId);
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

async function phase1BuildGraph(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "building_graph", progress: 0, progressMessage: "正在分析题库，规划知识图谱...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  const allQuestions = db
    .select()
    .from(questions)
    .where(eq(questions.bankId, bankId))
    .all();

  if (allQuestions.length === 0) throw new Error("题库没有题目");

  const questionsForAI = allQuestions.map((q) => ({
    content: q.content,
    options: JSON.parse(q.options) as string[],
    answer: q.answer,
    analysis: q.analysis || undefined,
  }));

  db.update(questionBanks)
    .set({ progress: 10, progressMessage: "AI 正在综合分析所有题目，提炼知识点...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const graphResult = await buildKnowledgeGraph(bank.name, questionsForAI);

  db.update(questionBanks)
    .set({ progress: 30, progressMessage: "正在写入知识图谱...", updatedAt: Date.now() })
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

  db.update(questionBanks)
    .set({ progress: 35, progressMessage: `知识图谱完成，共 ${nameToId.size} 个知识点`, updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();
}

async function phase2ClassifyQuestions(bankId: string): Promise<void> {
  db.update(questionBanks)
    .set({ status: "extracting", progress: 35, progressMessage: "正在将题目归类到知识点...", updatedAt: Date.now() })
    .where(eq(questionBanks.id, bankId))
    .run();

  const bank = db.select().from(questionBanks).where(eq(questionBanks.id, bankId)).get();
  if (!bank) throw new Error("题库不存在");

  // Get all knowledge point names for this bank
  const kpList = db
    .select()
    .from(knowledgePoints)
    .where(eq(knowledgePoints.bankId, bankId))
    .all();

  const kpNames = kpList.map((kp) => kp.name);
  const nameToId = new Map(kpList.map((kp) => [kp.name, kp.id]));

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
      const result = await classifyQuestion(bank.name, kpNames, {
        content: q.content,
        options: JSON.parse(q.options),
        answer: q.answer,
        analysis: q.analysis || undefined,
      });

      // Filter to only valid knowledge point names
      const validPoints = result.knowledge_points.filter((name) => nameToId.has(name));

      db.update(questions)
        .set({
          difficulty: result.difficulty,
          questionType: result.question_type,
          expectedTime: result.expected_time,
          aiExtracted: 1,
          aiKnowledgePoints: JSON.stringify(validPoints),
        })
        .where(eq(questions.id, q.id))
        .run();

      // Create question_knowledge associations
      for (let i = 0; i < validPoints.length; i++) {
        const kpId = nameToId.get(validPoints[i]);
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
    } catch {
      // Retry once
      try {
        const result = await classifyQuestion(bank.name, kpNames, {
          content: q.content,
          options: JSON.parse(q.options),
          answer: q.answer,
          analysis: q.analysis || undefined,
        });

        const validPoints = result.knowledge_points.filter((name) => nameToId.has(name));

        db.update(questions)
          .set({
            difficulty: result.difficulty,
            questionType: result.question_type,
            expectedTime: result.expected_time,
            aiExtracted: 1,
            aiKnowledgePoints: JSON.stringify(validPoints),
          })
          .where(eq(questions.id, q.id))
          .run();

        for (let i = 0; i < validPoints.length; i++) {
          const kpId = nameToId.get(validPoints[i]);
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
      } catch {
        failed++;
      }
    }

    completed++;
    const progress = 35 + Math.round((completed / total) * 60); // Phase 2 = 35-95%
    db.update(questionBanks)
      .set({
        progress,
        progressMessage: `题目归类中 (${completed}/${total})${failed > 0 ? `，${failed} 题失败` : ""}`,
        updatedAt: Date.now(),
      })
      .where(eq(questionBanks.id, bankId))
      .run();
  }

  // Mark as completed
  const kpCount = kpList.length;
  db.update(questionBanks)
    .set({
      status: "completed",
      progress: 100,
      progressMessage: `完成！${kpCount} 个知识点，${total - failed} 题已归类`,
      updatedAt: Date.now(),
    })
    .where(eq(questionBanks.id, bankId))
    .run();
}
