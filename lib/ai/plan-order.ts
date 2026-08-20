import { z } from "zod";
import { getAIClient, getModel } from "./client";

export interface PlanGraphInput {
  id: string;
  name: string;
  description: string | null;
  prerequisiteIds: string[];
  questionCount: number;
}

export interface PlannedKp {
  id: string;
  name: string;
  order: number;
  reason: string;
}

export interface PlanResult {
  orderedKnowledgePoints: PlannedKp[];
  planningNote: string;
}

const llmResultSchema = z.object({
  ordered_knowledge_points: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      order: z.number(),
      reason: z.string(),
    })
  ),
  planning_note: z.string(),
});

const FALLBACK_NOTE = "AI 服务暂不可用，已按知识点依赖关系自动排序";

export function topologicalFallback(graph: PlanGraphInput[]): PlanResult {
  const idSet = new Set(graph.map((g) => g.id));
  const inDegree = new Map<string, number>();
  for (const g of graph) {
    const valid = g.prerequisiteIds.filter((p) => idSet.has(p));
    inDegree.set(g.id, valid.length);
  }
  const successors = new Map<string, string[]>();
  for (const g of graph) {
    for (const p of g.prerequisiteIds) {
      if (!idSet.has(p)) continue;
      if (!successors.has(p)) successors.set(p, []);
      successors.get(p)!.push(g.id);
    }
  }
  const byId = new Map(graph.map((g) => [g.id, g]));
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  queue.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));

  const orderedIds: string[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    orderedIds.push(id);
    const next = (successors.get(id) ?? []).filter((s) => !visited.has(s));
    for (const s of next) {
      inDegree.set(s, (inDegree.get(s) ?? 0) - 1);
      if ((inDegree.get(s) ?? 0) <= 0) {
        queue.push(s);
      }
    }
    queue.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name));
  }
  // 如果有环，把剩下的按 name 追加进来
  for (const g of graph) {
    if (!visited.has(g.id)) orderedIds.push(g.id);
  }

  const ordered: PlannedKp[] = orderedIds.map((id, i) => {
    const g = byId.get(id)!;
    const reason =
      g.prerequisiteIds.filter((p) => idSet.has(p)).length === 0
        ? "基础前置 · 无依赖"
        : "依赖前置知识点";
    return { id: g.id, name: g.name, order: i + 1, reason };
  });

  return { orderedKnowledgePoints: ordered, planningNote: FALLBACK_NOTE };
}

export async function planKnowledgePointOrder(
  bankName: string,
  graph: PlanGraphInput[],
  customPrompt: string | undefined
): Promise<PlanResult> {
  if (graph.length === 0) {
    return { orderedKnowledgePoints: [], planningNote: "" };
  }
  if (graph.length === 1) {
    const g = graph[0];
    return {
      orderedKnowledgePoints: [
        { id: g.id, name: g.name, order: 1, reason: "唯一知识点" },
      ],
      planningNote: "题库仅含一个知识点。",
    };
  }

  try {
    const client = getAIClient();
    const graphForAi = graph.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      prerequisite_ids: g.prerequisiteIds,
      question_count: g.questionCount,
    }));

    const userPrompt = `你是 PointMaster 学习路径规划助手。请根据题库的知识图谱，为用户规划一条合理的知识点刷题顺序。

## 题库
${bankName}

## 知识图谱
${JSON.stringify(graphForAi, null, 2)}

## 用户的自定义要求（可能为空）
${customPrompt ? customPrompt : "（无）"}

## 排序原则
1. 必须遵守知识点依赖关系：前置知识点排在依赖它的知识点之前。
2. 在不破坏依赖的前提下，尽量满足用户的自定义要求（软约束）。
3. 为每个知识点给出一句简短的排序理由。
4. 必须包含图谱中的全部知识点，不要遗漏，不要捏造新的。

请仅输出 JSON：
{
  "ordered_knowledge_points": [
    { "id": "...", "name": "...", "order": 1, "reason": "..." }
  ],
  "planning_note": "一句话总结你的排序思路，特别说明如何处理了用户的自定义要求"
}`;

    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: "你是教育领域的学习路径规划专家，输出严格 JSON。" },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content || "";
    const parsed = llmResultSchema.parse(JSON.parse(text));

    const idSet = new Set(graph.map((g) => g.id));
    const seen = new Set<string>();
    const cleaned: PlannedKp[] = [];
    for (const item of parsed.ordered_knowledge_points) {
      if (!idSet.has(item.id)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      cleaned.push({ ...item, order: cleaned.length + 1 });
    }
    // 兜底：补齐 LLM 漏掉的 KP
    for (const g of graph) {
      if (!seen.has(g.id)) {
        cleaned.push({
          id: g.id,
          name: g.name,
          order: cleaned.length + 1,
          reason: "未在 AI 排序中出现，已自动补入末尾",
        });
      }
    }
    return { orderedKnowledgePoints: cleaned, planningNote: parsed.planning_note };
  } catch (err) {
    console.warn("[plan-order] LLM 失败，使用拓扑兜底：", err);
    return topologicalFallback(graph);
  }
}
