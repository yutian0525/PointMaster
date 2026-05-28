import { z } from "zod";
import { getAIClient, getModel } from "./client";

const graphNodeSchema = z.object({
  name: z.string(),
  description: z.string(),
  prerequisites: z.array(z.string()),
});

const graphResultSchema = z.object({
  knowledge_points: z.array(graphNodeSchema),
});

export type GraphResult = z.infer<typeof graphResultSchema>;

export async function buildKnowledgeGraph(
  bankName: string,
  knowledgePointsWithCount: { name: string; count: number }[]
): Promise<GraphResult> {
  const client = getAIClient();

  const listText = knowledgePointsWithCount
    .map((kp) => `- ${kp.name} (${kp.count}题)`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的知识体系专家。请根据给定的知识点列表，分析它们之间的学习依赖关系，构建知识图谱。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}
知识点列表（含关联题目数）：
${listText}

请以 JSON 格式返回知识图谱：
{
  "knowledge_points": [
    {
      "name": "极限",
      "description": "描述函数在某点附近的趋近行为，是导数和积分的基础概念。",
      "prerequisites": []
    },
    {
      "name": "导数",
      "description": "函数在某点处的瞬时变化率，几何意义为切线斜率。",
      "prerequisites": ["极限"]
    }
  ]
}

要求：
- prerequisites 只填直接依赖的知识点名称（必须是列表中存在的名称）
- 构建有向无环图（DAG），不能出现循环依赖
- 基础知识点 prerequisites 为空
- description 用一句话概括该知识点的核心含义
- 只返回 JSON，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return graphResultSchema.parse(parsed);
}
