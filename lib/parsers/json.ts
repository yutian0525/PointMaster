import { ParsedQuestion } from "@/types";
import { z } from "zod";

const questionSchema = z.object({
  content: z.string().optional(),
  question: z.string().optional(),
  题目: z.string().optional(),
  options: z.array(z.string()),
  answer: z.string(),
  analysis: z.string().optional(),
  解析: z.string().optional(),
});

export function parseJSON(content: string): ParsedQuestion[] {
  const raw = JSON.parse(content);
  if (!Array.isArray(raw)) {
    throw new Error("JSON 文件格式错误：期望为数组");
  }

  return raw.map((item, index) => {
    const parsed = questionSchema.parse(item);
    const questionContent = parsed.content || parsed.question || parsed.题目;
    if (!questionContent) {
      throw new Error(`第 ${index + 1} 题缺少题目内容`);
    }
    return {
      content: questionContent,
      options: parsed.options,
      answer: parsed.answer,
      analysis: parsed.analysis || parsed.解析,
    };
  });
}
