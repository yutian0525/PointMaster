import { describe, it, expect } from "vitest";
import { checkCompletion } from "../completion";
import type { MasteryState } from "../types";

const baseM: MasteryState = {
  mastery: 0,
  confidence: 0,
  streak: 0,
  testedCount: 0,
  correctCount: 0,
};

describe("checkCompletion", () => {
  it("题池耗尽 → complete", () => {
    expect(checkCompletion(false, { ...baseM, mastery: 0.1, confidence: 0.1 }, "normal")).toBe(
      "complete"
    );
  });

  it("normal 达阈值 → complete", () => {
    expect(checkCompletion(true, { ...baseM, mastery: 0.85, confidence: 0.75 }, "normal")).toBe(
      "complete"
    );
  });

  it("normal 仅 mastery 达阈值 → continue", () => {
    expect(checkCompletion(true, { ...baseM, mastery: 0.85, confidence: 0.5 }, "normal")).toBe(
      "continue"
    );
  });

  it("wrong-redo 即使达阈值也 continue（必须刷光错题）", () => {
    expect(
      checkCompletion(true, { ...baseM, mastery: 0.95, confidence: 0.95 }, "wrong-redo")
    ).toBe("continue");
  });

  it("wrong-redo 题池耗尽 → complete", () => {
    expect(
      checkCompletion(false, { ...baseM, mastery: 0.95, confidence: 0.95 }, "wrong-redo")
    ).toBe("complete");
  });
});
