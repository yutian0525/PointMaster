import { getAIClient, getModel } from "./client";

export async function askAboutSelection(
  knowledgePointName: string,
  selectedText: string,
  sourceCardContent: string
): Promise<string> {
  const client = getAIClient();

  const prompt = `用户在学习「${knowledgePointName}」时，对以下内容中的「${selectedText}」提出了疑问。

来源卡片内容：
${sourceCardContent}

请用简洁清晰的语言解释「${selectedText}」：
- 结合当前知识点的上下文
- 说明与原卡片内容的关联
- 如有数学概念给出简单例子
- 控制在 150 字以内
- 直接输出解答正文（Markdown），不要任何前缀或代码块`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位知识辅导老师，针对学生选中的术语做精炼解释。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
