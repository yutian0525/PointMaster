import { ParsedQuestion } from "@/types";

export function parseTXT(content: string): ParsedQuestion[] {
  const blocks = content.split(/\n\s*\n/).filter((b) => b.trim());
  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) continue;

    let questionContent = "";
    const options: string[] = [];
    let answer = "";
    let analysis: string | undefined;

    for (const line of lines) {
      if (/^[A-D][.．、]\s*/.test(line)) {
        options.push(line);
      } else if (/^答案[：:]\s*/.test(line)) {
        answer = line.replace(/^答案[：:]\s*/, "").trim();
      } else if (/^解析[：:]\s*/.test(line)) {
        analysis = line.replace(/^解析[：:]\s*/, "").trim();
      } else if (!questionContent || (!options.length && !answer)) {
        questionContent +=
          (questionContent ? " " : "") + line.replace(/^\d+[.．、]\s*/, "");
      }
    }

    if (questionContent && answer) {
      questions.push({ content: questionContent, options, answer, analysis });
    }
  }

  return questions;
}
