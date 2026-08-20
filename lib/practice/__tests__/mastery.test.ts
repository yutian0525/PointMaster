import { describe, it, expect } from "vitest";
import { applyAnswer } from "../mastery";
import type { MasteryState } from "../types";

const initial: MasteryState = {
  mastery: 0,
  confidence: 0,
  streak: 0,
  testedCount: 0,
  correctCount: 0,
};

describe("applyAnswer — 答对", () => {
  it("增加 mastery、confidence，streak 累加", () => {
    const out = applyAnswer({
      prev: initial,
      score: 1,
      difficulty: 0.5,
      answerTime: 30,
      expectedTime: 60,
    });
    expect(out.mastery).toBeGreaterThan(0);
    expect(out.confidence).toBeCloseTo(0.15, 6);
    expect(out.streak).toBe(1);
    expect(out.testedCount).toBe(1);
    expect(out.correctCount).toBe(1);
  });

  it("快答比慢答 mastery 增加更多", () => {
    const fast = applyAnswer({ prev: initial, score: 1, difficulty: 1, answerTime: 0, expectedTime: 60 });
    const slow = applyAnswer({ prev: initial, score: 1, difficulty: 1, answerTime: 60, expectedTime: 60 });
    expect(fast.mastery).toBeGreaterThan(slow.mastery);
  });

  it("缺失 difficulty/expectedTime 兜底 0.5/60", () => {
    const out = applyAnswer({
      prev: initial,
      score: 1,
      difficulty: null,
      answerTime: 30,
      expectedTime: null,
    });
    // difficulty=0.5 expected=60 answer=30 => timeFactor=0.5 => 0.5*0.1*(1+0.25)=0.0625
    expect(out.mastery).toBeCloseTo(0.0625, 6);
  });
});

describe("applyAnswer — 答错", () => {
  it("减 mastery、confidence +0.10、streak 重置为 -1", () => {
    const prev: MasteryState = { ...initial, mastery: 0.5, confidence: 0.4, streak: 3 };
    const out = applyAnswer({ prev, score: 0, difficulty: 0.5, answerTime: 40, expectedTime: 60 });
    expect(out.mastery).toBeCloseTo(0.5 - 0.06, 6);
    expect(out.confidence).toBeCloseTo(0.5, 6);
    expect(out.streak).toBe(-1);
    expect(out.correctCount).toBe(0);
  });

  it("连错累加为负", () => {
    let s: MasteryState = { ...initial, streak: -2 };
    s = applyAnswer({ prev: s, score: 0, difficulty: 0.5, answerTime: 40, expectedTime: 60 });
    expect(s.streak).toBe(-3);
  });
});

describe("applyAnswer — 边界", () => {
  it("mastery clamp 到 0~1", () => {
    const high: MasteryState = { ...initial, mastery: 0.97, confidence: 0.5 };
    const out = applyAnswer({ prev: high, score: 1, difficulty: 1, answerTime: 0, expectedTime: 30 });
    expect(out.mastery).toBeLessThanOrEqual(1);
    const low: MasteryState = { ...initial, mastery: 0.03 };
    const out2 = applyAnswer({ prev: low, score: 0, difficulty: 1, answerTime: 0, expectedTime: 30 });
    expect(out2.mastery).toBeGreaterThanOrEqual(0);
  });

  it("confidence clamp 到 0~1", () => {
    const c: MasteryState = { ...initial, confidence: 0.95 };
    const out = applyAnswer({ prev: c, score: 1, difficulty: 0.5, answerTime: 30, expectedTime: 60 });
    expect(out.confidence).toBeLessThanOrEqual(1);
  });
});
