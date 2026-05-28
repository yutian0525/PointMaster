import { getAIClient, getModel } from "./client";
import { v4 as uuid } from "uuid";
import type { MicroCard, CardConnection, GenerateRequest } from "@/types/micro-learning";

const SYSTEM_PROMPT = `你是一位教学设计专家，擅长将知识点拆解为易于理解的微学习卡片。

要求：
- 语言精炼，避免冗余
- 使用 **加粗** 标记关键术语
- 数学公式使用行内文本表达
- 每张卡片内容控制在 100-200 字`;

function buildUserPrompt(
  knowledgePoint: { name: string; description: string | null },
  context?: GenerateRequest["context"]
): string {
  let prompt = `请为以下知识点生成微学习卡片：

### 知识点
名称：${knowledgePoint.name}
描述：${knowledgePoint.description || "无"}
`;

  if (context?.questions?.length) {
    prompt += `\n### 该知识点的例题\n`;
    context.questions.forEach((q, i) => {
      const opts = q.options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o}`).join("\n");
      prompt += `\n题目${i + 1}：${q.content}\n${opts}\n答案：${q.answer}\n`;
      if (q.analysis) prompt += `解析：${q.analysis}\n`;
    });
  }

  if (context?.answerRecords?.length) {
    const correct = context.answerRecords.filter((r) => r.isCorrect).length;
    const total = context.answerRecords.length;
    const avgTime = Math.round(
      context.answerRecords.reduce((s, r) => s + r.answerTime, 0) / total
    );
    prompt += `\n### 用户答题情况\n正确率：${correct}/${total}，平均用时：${avgTime}秒\n`;
  }

  if (context?.errorPatterns?.length) {
    prompt += `\n### 用户错误模式\n`;
    context.errorPatterns.forEach((e) => {
      prompt += `- 题目「${e.questionContent}」：选了 ${e.wrongOption}，正确答案是 ${e.correctOption}\n`;
    });
  }

  prompt += `\n请严格按以下格式生成5张独立卡片，每张卡片以"## "（两个井号+空格）开头，卡片之间用空行分隔。不要使用###，不要嵌套，每个##都是独立卡片：

## 核心概念
（先给出知识点名称和一句话概括，再用精炼的语言解释核心定义、关键结论和适用范围，标记关键术语）

## 识别信号
（列出3-5个"看到__就想到__"的触发信号）

## 解题模板
（给出标准化的解题步骤框架，用编号标注每一步）

## 易错点
（基于用户错误模式指出高频错误，提供反例。若无用户数据则给出通用易错点）

## 例题
（选取1-2道代表性题目，给出完整解题过程）`;

  return prompt;
}

const CARD_TYPE_MAP: Record<string, { type: MicroCard["type"]; importance: MicroCard["importance"] }> = {
  "核心概念": { type: "concept", importance: "required" },
  "识别信号": { type: "signal", importance: "recommended" },
  "解题模板": { type: "template", importance: "required" },
  "易错点": { type: "pitfall", importance: "required" },
  "例题": { type: "example", importance: "recommended" },
};

function parseMarkdownToCards(markdown: string): MicroCard[] {
  // Split on ## or ### headings
  const sections = markdown.split(/^#{2,3}\s+/m).filter(Boolean);
  const cards: MicroCard[] = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const titleLine = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();

    if (!content) continue;

    const matched = Object.entries(CARD_TYPE_MAP).find(([key]) => titleLine.includes(key));
    if (!matched) continue;

    const [, { type, importance }] = matched;
    cards.push({
      id: uuid(),
      type,
      title: titleLine,
      content,
      importance,
    });
  }

  return cards;
}

function buildConnections(cards: MicroCard[]): CardConnection[] {
  const connections: CardConnection[] = [];
  const byType = (t: MicroCard["type"]) => cards.find((c) => c.type === t);

  const concept = byType("concept");
  const template = byType("template");
  const pitfall = byType("pitfall");
  const example = byType("example");
  const signal = byType("signal");

  if (concept && pitfall) {
    connections.push({ from: concept.id, to: pitfall.id, label: "对比说明" });
  }
  if (concept && signal) {
    connections.push({ from: concept.id, to: signal.id, label: "识别依据" });
  }
  if (template && example) {
    connections.push({ from: template.id, to: example.id, label: "模板应用" });
  }
  if (pitfall && example) {
    connections.push({ from: pitfall.id, to: example.id, label: "反例练习" });
  }

  return connections;
}

export async function generateMicroLearning(
  knowledgePoint: { name: string; description: string | null },
  context?: GenerateRequest["context"]
): Promise<{ cards: MicroCard[]; connections: CardConnection[] }> {
  const client = getAIClient();
  const userPrompt = buildUserPrompt(knowledgePoint, context);

  const response = await client.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  const markdown = response.choices[0]?.message?.content || "";
  const cards = parseMarkdownToCards(markdown);
  const connections = buildConnections(cards);

  return { cards, connections };
}
