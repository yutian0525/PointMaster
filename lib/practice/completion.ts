import {
  COMPLETION_CONFIDENCE_THRESHOLD,
  COMPLETION_MASTERY_THRESHOLD,
} from "./mastery";
import type { MasteryState, SessionMode } from "./types";

export type CompletionResult = "continue" | "complete";

export function checkCompletion(
  hasNextQuestion: boolean,
  mastery: MasteryState,
  mode: SessionMode
): CompletionResult {
  if (!hasNextQuestion) return "complete";
  if (mode === "wrong-redo") return "continue";
  if (
    mastery.mastery >= COMPLETION_MASTERY_THRESHOLD &&
    mastery.confidence >= COMPLETION_CONFIDENCE_THRESHOLD
  ) {
    return "complete";
  }
  return "continue";
}

export { COMPLETION_MASTERY_THRESHOLD, COMPLETION_CONFIDENCE_THRESHOLD };
