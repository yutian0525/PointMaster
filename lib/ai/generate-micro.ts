import { getAIClient, getModel } from "./client";
import type { ExampleAnalysis } from "@/types/micro-learning";

interface ExampleInput {
  questionId: string;
  content: string;
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
}

interface GenerateInput {
  knowledgePointName: string;
  knowledgePointDescription: string | null;
  focusHint: string | null;
  examples: ExampleInput[];
}

interface AIRawResult {
  detailed_explanation: string;
  example_analyses: Array<{ questionId: string; analysis: string }>;
}

const SYSTEM_PROMPT = `你是一位教学设计专家，针对指定知识点给学生做一对一辅导。
输出严格遵循 JSON 格式，不要包裹 markdown 代码块。`;

function buildUserPrompt(input: GenerateInput): string {
  let prompt = `请为知识点「${input.knowledgePointName}」生成微学习内容。\n\n### 知识点描述\n${input.knowledgePointDescription || "无"}\n\n### 用户薄弱表现\n${input.focusHint || "用户希望系统学习此知识点"}\n\n### 例题与用户作答情况\n`;

  input.examples.forEach((ex, i) => {
    const opts = ex.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("  ");
    prompt += `\n题目${i + 1}（id: ${ex.questionId}）：${ex.content}\n选项：${opts}\n标准答案：${ex.answer}\n`;
    if (ex.userAnswer !== undefined) {
      prompt += `用户作答：${ex.userAnswer}（${ex.isWrong ? "答错" : "答对"}）\n`;
    }
  });

  prompt += `\n### 输出格式（严格 JSON，不要 markdown 包裹）
{
  "detailed_explanation": "Markdown 文本：按子标题组织（## 定义 / ## 原理 / ## 适用场景 / ## 常见误区 / ## 学习建议），500-1000 字",
  "example_analyses": [
    {
      "questionId": "必须与上面例题 id 严格对应",
      "analysis": "Markdown 文本：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源；200-400 字"
    }
  ]
}`;

  return prompt;
}

async function callLLMOnce(input: GenerateInput): Promise<AIRawResult> {
  const client = getAIClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(input) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "";
  const parsed = JSON.parse(raw);
  if (typeof parsed.detailed_explanation !== "string") {
    throw new Error("missing detailed_explanation");
  }
  if (!Array.isArray(parsed.example_analyses)) {
    throw new Error("missing example_analyses");
  }
  return parsed as AIRawResult;
}

export async function generateMicroLearning(
  input: GenerateInput
): Promise<{ detailedExplanation: string; exampleAnalyses: ExampleAnalysis[] }> {
  let raw: AIRawResult;
  try {
    raw = await callLLMOnce(input);
  } catch (err) {
    console.warn("[micro-learning] first attempt failed, retrying once", err);
    raw = await callLLMOnce(input);
  }

  const analysisMap = new Map<string, string>();
  for (const item of raw.example_analyses) {
    if (item && typeof item.questionId === "string") {
      analysisMap.set(item.questionId, typeof item.analysis === "string" ? item.analysis : "");
    }
  }

  const exampleAnalyses: ExampleAnalysis[] = input.examples.map((ex) => ({
    questionId: ex.questionId,
    content: ex.content,
    options: ex.options,
    answer: ex.answer,
    userAnswer: ex.userAnswer,
    isWrong: ex.isWrong,
    analysis: analysisMap.get(ex.questionId) ?? "",
  }));

  return {
    detailedExplanation: raw.detailed_explanation,
    exampleAnalyses,
  };
}

export async function regenerateExampleAnalysis(
  knowledgePointName: string,
  example: ExampleInput
): Promise<string> {
  const client = getAIClient();
  const opts = example.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("  ");
  const userPart = example.userAnswer !== undefined
    ? `用户作答：${example.userAnswer}（${example.isWrong ? "答错" : "答对"}）\n`
    : "";

  const prompt = `知识点：${knowledgePointName}

题目：${example.content}
选项：${opts}
标准答案：${example.answer}
${userPart}
请输出该题的解题分析（Markdown 格式，200-400 字）：审题 → 解题思路 → 关键步骤 → 若答错则指出错误根源。直接输出分析正文，不要任何前缀或代码块。`;

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: "你是一位教学设计专家，按要求生成简洁清晰的解题分析。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
