import { z } from "zod";
import { getAIClient, getModel } from "./client";

const classifyResultSchema = z.object({
  knowledge_points: z.array(z.string()).min(1).max(3),
  difficulty: z.number().min(0).max(1),
  question_type: z.string(),
  expected_time: z.number().min(5).max(300),
});

export type ClassifyResult = z.infer<typeof classifyResultSchema>;

export async function classifyQuestion(
  bankName: string,
  knowledgePointNames: string[],
  question: {
    content: string;
    options: string[];
    answer: string;
    analysis?: string;
  }
): Promise<ClassifyResult> {
  const client = getAIClient();

  const optionsText = question.options
    .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
    .join("\n");

  const kpList = knowledgePointNames.map((name) => `- ${name}`).join("\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的题目分类专家。请根据已有的知识点列表，将给定题目归类到对应的知识点，并评估难度。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}

已有知识点列表：
${kpList}

题目：${question.content}
选项：
${optionsText}
答案：${question.answer}
${question.analysis ? `解析：${question.analysis}` : ""}

请将此题归类到上述知识点列表中最相关的 1-3 个知识点，并评估难度。

以 JSON 格式返回：
{
  "knowledge_points": ["知识点1", "知识点2"],
  "difficulty": 0.65,
  "question_type": "单选题",
  "expected_time": 30
}

要求：
- knowledge_points 必须从上面的"已有知识点列表"中选择，不要自创新知识点
- 选择 1-3 个最相关的知识点，第一个为主要知识点
- difficulty 根据题目计算复杂度和概念深度综合评估（0-1）
- question_type：单选题/多选题/判断题/填空题/计算题
- expected_time 根据难度估算，简单题15-20秒，中等题25-40秒，难题45-90秒
- 只返回 JSON，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return classifyResultSchema.parse(parsed);
}
