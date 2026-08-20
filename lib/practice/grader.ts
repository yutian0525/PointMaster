import type { QuestionTypeName } from "./types";

export function normalizeAnswer(raw: string, type: QuestionTypeName): string {
  if (type === "判断题") {
    const lower = (raw || "").trim().toLowerCase();
    if (["a", "对", "正确", "true", "t", "1", "✓"].includes(lower)) return "对";
    if (["b", "错", "错误", "false", "f", "0", "✗"].includes(lower)) return "错";
    if (lower === "对" || lower === "错") return lower === "对" ? "对" : "错";
    return raw.trim();
  }
  const letters = (raw || "")
    .toUpperCase()
    .split("")
    .filter((c) => c >= "A" && c <= "Z");
  const dedup = Array.from(new Set(letters));
  dedup.sort();
  return dedup.join("");
}

export function grade(
  userAnswer: string,
  correctAnswer: string,
  type: QuestionTypeName
): 0 | 1 {
  const u = normalizeAnswer(userAnswer, type);
  const c = normalizeAnswer(correctAnswer, type);
  if (!u) return 0;
  return u === c ? 1 : 0;
}
