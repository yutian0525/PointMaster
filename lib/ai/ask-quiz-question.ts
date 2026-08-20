import { getAIClient, getModel } from "./client";

export interface QuizAskContext {
  questionContent: string;
  options: string[];
  correctAnswer: string;
  analysis: string | null;
  history: Array<{ question: string; answer: string }>;
  newQuestion: string;
}

export async function askQuizQuestion(ctx: QuizAskContext): Promise<string> {
  const client = getAIClient();
  const optionsText = ctx.options
    .map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`)
    .join("\n");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    {
      role: "system",
      content:
        "你是题目辅导老师。学生针对一道题向你提问，请基于题目本身（题干、选项、正确答案、解析）为他答疑解惑。回答简洁直接，控制在 200 字以内，使用 Markdown 普通文本（不要代码块包裹答案）。",
    },
    {
      role: "user",
      content: `下面是这道题的全部上下文，作为我们对话的背景：

题干：
${ctx.questionContent}

选项：
${optionsText}

正确答案：${ctx.correctAnswer}
${ctx.analysis ? `已有解析：\n${ctx.analysis}\n` : ""}

接下来我会就这道题向你提问。`,
    },
    { role: "assistant", content: "好的，请提问。" },
  ];

  for (const turn of ctx.history) {
    messages.push({ role: "user", content: turn.question });
    messages.push({ role: "assistant", content: turn.answer });
  }
  messages.push({ role: "user", content: ctx.newQuestion });

  const response = await client.chat.completions.create({
    model: getModel(),
    messages,
    temperature: 0.5,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
