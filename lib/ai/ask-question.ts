import { getAIClient, getModel } from "./client";

export async function askAboutSelection(
  knowledgePointName: string,
  question: string,
  sourceCardContent: string,
  selectedText?: string
): Promise<string> {
  const client = getAIClient();

  const focusLine = selectedText
    ? `用户选中了「${selectedText}」并提问。`
    : `用户针对该卡片整体提问。`;

  const prompt = `用户在学习「${knowledgePointName}」时，针对以下卡片内容提出了问题。

来源卡片内容：
${sourceCardContent}

${focusLine}
用户的问题：${question}

请直接回答用户的问题：
- 结合卡片内容和知识点上下文
- 如果用户要求出题，就出题并给出答案和解析
- 如果用户要求解释概念，就简洁清晰地解释
- 控制在 200 字以内
- 直接输出回答正文（Markdown），不要任何前缀或代码块`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是知识辅导老师。根据用户的具体问题直接作答，不要固定以「解释概念」的形式回复。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
