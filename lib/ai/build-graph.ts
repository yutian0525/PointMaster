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
  allQuestions: { content: string; options: string[]; answer: string; analysis?: string }[]
): Promise<GraphResult> {
  const client = getAIClient();

  const questionsText = allQuestions
    .map((q, i) => {
      const opts = q.options.map((opt, j) => `${String.fromCharCode(65 + j)}. ${opt}`).join(" | ");
      return `${i + 1}. ${q.content}\n   选项：${opts}\n   答案：${q.answer}${q.analysis ? `\n   解析：${q.analysis}` : ""}`;
    })
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的知识体系专家。请根据给定的题库所有题目，提炼出核心知识点并构建知识图谱（学习依赖关系）。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}
题目总数：${allQuestions.length}

以下是该题库的所有题目：

${questionsText}

请综合分析所有题目，提炼出该题库涵盖的**核心知识点**（不要过于细碎，保持 3-8 个左右，根据题库规模调整），并构建知识图谱。

以 JSON 格式返回：
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
- 知识点数量适中：5 题左右的小题库提炼 3-5 个知识点，20 题以上的中等题库提炼 5-8 个
- 知识点名称简洁（2-6 字），如"导数"、"极值"、"定积分"
- prerequisites 只填直接依赖的知识点名称（必须是你返回的列表中存在的名称）
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
