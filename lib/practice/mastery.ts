import type { MasteryState, MasteryUpdateInput } from "./types";

const DEFAULT_DIFFICULTY = 0.5;
const DEFAULT_EXPECTED_TIME = 60;

export const COMPLETION_MASTERY_THRESHOLD = 0.8;
export const COMPLETION_CONFIDENCE_THRESHOLD = 0.7;

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function applyAnswer(input: MasteryUpdateInput): MasteryState {
  const { prev, score, answerTime } = input;
  const difficulty = input.difficulty ?? DEFAULT_DIFFICULTY;
  const expectedTime = input.expectedTime ?? DEFAULT_EXPECTED_TIME;

  let mastery = prev.mastery;
  let confidence = prev.confidence;

  if (score === 1) {
    const timeFactor = clamp(1 - answerTime / Math.max(expectedTime, 1), 0, 1);
    mastery += difficulty * 0.1 * (1 + timeFactor * 0.5);
    confidence += 0.15;
  } else {
    mastery -= difficulty * 0.12;
    confidence += 0.1;
  }

  mastery = clamp(mastery, 0, 1);
  confidence = clamp(confidence, 0, 1);

  let streak: number;
  if (score === 1) {
    streak = prev.streak >= 0 ? prev.streak + 1 : 1;
  } else {
    streak = prev.streak <= 0 ? prev.streak - 1 : -1;
  }

  return {
    mastery,
    confidence,
    streak,
    testedCount: prev.testedCount + 1,
    correctCount: prev.correctCount + (score === 1 ? 1 : 0),
  };
}
