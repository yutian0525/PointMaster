import { z } from "zod";
import { getAIClient, getModel } from "./client";

const extractionResultSchema = z.object({
  knowledge_points: z.array(z.string()).min(1).max(5),
  difficulty: z.number().min(0).max(1),
  question_type: z.string(),
  expected_time: z.number().min(5).max(300),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export async function extractKnowledgePoints(
  bankName: string,
  question: {
    content: string;
    options: string[];
    answer: string;
    analysis?: string;
  }
): Promise<ExtractionResult> {
  const client = getAIClient();

  const optionsText = question.options
    .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      {
        role: "system",
        content:
          "你是一个教育领域的知识点标注专家。请根据给定的题目信息，提取该题涉及的知识点并评估难度。",
      },
      {
        role: "user",
        content: `学科领域：${bankName}

题目：${question.content}
选项：
${optionsText}
答案：${question.answer}
${question.analysis ? `解析：${question.analysis}` : ""}

请以 JSON 格式返回：
{
  "knowledge_points": ["知识点1", "知识点2"],
  "difficulty": 0.65,
  "question_type": "单选题",
  "expected_time": 30
}

要求：
- 知识点名称要简洁可复用（如"导数"、"极值"、"定积分"），不要写描述性文字
- difficulty 根据题目计算复杂度和概念深度综合评估
- expected_time 根据难度估算，简单题15-20秒，中等题25-40秒，难题45-90秒
- 只返回 JSON，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(text);
  return extractionResultSchema.parse(parsed);
}
