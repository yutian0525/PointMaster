/**
 * 将 TXT 判断题题库转换为 JSON 格式，并调用 AI 生成题目解析
 *
 * 用法: npx tsx scripts/convert-txt-to-json.ts
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";

const INPUT_FILE = path.join(process.cwd(), "data/ncre3_theory_trueOrFalse_2026-05-28.txt");
const OUTPUT_FILE = path.join(process.cwd(), "data/ncre3_theory_trueOrFalse.json");

const BATCH_SIZE = 10;

interface Question {
  content: string;
  options: string[];
  answer: string;
  analysis?: string;
}

function parseTxt(text: string): Question[] {
  const questions: Question[] = [];
  const lines = text.split("\n").map((l) => l.trimEnd());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Match question line: "1. [判断题] ..."
    const qMatch = line.match(/^\d+\.\s*\[判断题\]\s*(.+)/);
    if (qMatch) {
      const content = qMatch[1].trim();
      const options: string[] = [];
      let answer = "";

      i++;
      // Read options and answer
      while (i < lines.length) {
        const current = lines[i].trim();
        if (!current) {
          i++;
          break;
        }

        const optMatch = current.match(/^([A-D])、(.+)/);
        if (optMatch) {
          options.push(optMatch[2].trim());
        }

        const ansMatch = current.match(/【答案】([A-D])/);
        if (ansMatch) {
          answer = ansMatch[1];
        }

        i++;
      }

      if (content && options.length >= 2 && answer) {
        questions.push({ content, options, answer });
      }
    } else {
      i++;
    }
  }

  return questions;
}

async function generateAnalysisBatch(
  client: OpenAI,
  model: string,
  questions: Question[]
): Promise<string[]> {
  const questionsText = questions
    .map((q, i) => {
      const answerText = q.answer === "A" ? "正确" : "错误";
      return `${i + 1}. ${q.content}\n   答案：${answerText}`;
    })
    .join("\n\n");

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是一个计算机等级考试辅导专家。请为以下判断题生成简洁的解析（每题 1-3 句话），解释为什么答案是正确或错误的。",
      },
      {
        role: "user",
        content: `请为以下 ${questions.length} 道判断题生成解析：

${questionsText}

以 JSON 数组格式返回，每个元素是对应题目的解析字符串：
["第1题解析", "第2题解析", ...]

要求：
- 解析简洁明了，1-3句话
- 指出关键知识点或易错点
- 只返回 JSON 数组，不要其他文字`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);

  // Handle both { "analyses": [...] } and plain array
  if (Array.isArray(parsed)) {
    return parsed;
  }
  const arr = parsed.analyses || parsed.analysis || parsed.results || Object.values(parsed)[0];
  if (Array.isArray(arr)) {
    return arr;
  }
  return questions.map(() => "");
}

async function main() {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL || "https://api.deepseek.com";
  const model = process.env.LLM_MODEL || "deepseek-chat";

  if (!apiKey) {
    console.error("错误: 请设置 LLM_API_KEY 环境变量");
    console.error("例: LLM_API_KEY=sk-xxx npx tsx scripts/convert-txt-to-json.ts");
    process.exit(1);
  }

  console.log(`读取文件: ${INPUT_FILE}`);
  const text = fs.readFileSync(INPUT_FILE, "utf-8");
  const questions = parseTxt(text);
  console.log(`解析到 ${questions.length} 道判断题`);

  const client = new OpenAI({ apiKey, baseURL });

  console.log(`开始调用 AI 生成解析 (模型: ${model}, 每批 ${BATCH_SIZE} 题)...`);

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, questions.length);
    process.stdout.write(`  处理 ${i + 1}-${batchEnd} / ${questions.length} ...`);

    try {
      const analyses = await generateAnalysisBatch(client, model, batch);
      for (let j = 0; j < batch.length; j++) {
        batch[j].analysis = analyses[j] || "";
      }
      console.log(" 完成");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` 失败: ${msg}`);
    }

    // Rate limit: small delay between batches
    if (i + BATCH_SIZE < questions.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Convert answer format: "A" → "A" (keep as-is for parser compatibility)
  const output = questions.map((q) => ({
    content: q.content,
    options: q.options.map((opt, idx) => `${String.fromCharCode(65 + idx)}. ${opt}`),
    answer: q.answer,
    analysis: q.analysis || "",
  }));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n输出文件: ${OUTPUT_FILE}`);
  console.log(`共 ${output.length} 题，其中 ${output.filter((q) => q.analysis).length} 题有解析`);
}

main().catch((err) => {
  console.error("执行失败:", err);
  process.exit(1);
});
