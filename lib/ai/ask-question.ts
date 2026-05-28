import { getAIClient, getModel } from "./client";
import { v4 as uuid } from "uuid";
import type { MicroCard, CardConnection } from "@/types/micro-learning";

export async function askAboutSelection(
  knowledgePointName: string,
  selectedText: string,
  sourceCardId: string,
  sourceCardContent: string
): Promise<{ card: MicroCard; connection: CardConnection }> {
  const client = getAIClient();

  const prompt = `用户在学习「${knowledgePointName}」时，对以下内容中的「${selectedText}」提出了疑问。

来源卡片内容：
${sourceCardContent}

请用简洁清晰的语言解释「${selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如果涉及数学概念，给出简单例子
- 控制在 150 字以内`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位知识辅导老师，擅长用简洁清晰的语言解释概念。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content || "";
  const cardId = uuid();

  return {
    card: {
      id: cardId,
      type: "extended",
      title: `什么是${selectedText}？`,
      content,
      importance: "recommended",
      sourceKeyword: selectedText,
    },
    connection: {
      from: sourceCardId,
      to: cardId,
      label: "提问延伸",
    },
  };
}
