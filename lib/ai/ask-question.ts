import { getAIClient, getModel } from "./client";
import { v4 as uuid } from "uuid";
import type { MicroCard, CardConnection } from "@/types/micro-learning";

export async function askAboutSelection(
  knowledgePointName: string,
  question: string,
  sourceCardId: string,
  sourceCardContent: string
): Promise<{ card: MicroCard; connection: CardConnection }> {
  const client = getAIClient();

  const prompt = `用户在学习「${knowledgePointName}」时，针对以下卡片内容提出了问题。

来源卡片内容：
${sourceCardContent}

用户的问题：${question}

请直接回答用户的问题：
- 结合卡片内容和知识点上下文
- 如果用户要求出题，就出题并给出答案和解析
- 如果用户要求解释，就简洁清晰地解释
- 回答控制在 200 字以内`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位知识辅导老师。根据用户的具体问题直接作答，不要固定以「解释概念」的形式回复。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "";
  const cardId = uuid();
  const shortQuestion = question.length > 15 ? question.slice(0, 15) + "…" : question;

  return {
    card: {
      id: cardId,
      type: "extended",
      title: shortQuestion,
      content,
      importance: "recommended",
      sourceKeyword: shortQuestion,
    },
    connection: {
      from: sourceCardId,
      to: cardId,
      label: "提问延伸",
    },
  };
}
