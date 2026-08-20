import { describe, it, expect } from "vitest";
import { pickNextQuestionWith, type SelectorDataSource, type SelectorPoolItem } from "../selector";
import type { SelectorContext } from "../types";

function makeDS(opts: {
  primary: SelectorPoolItem[];
  done?: Record<string, string[]>;
  wrong?: Record<string, string[]>;
}): SelectorDataSource {
  return {
    primaryQuestionIds: () => opts.primary.map((q) => q.id),
    wrongIdsInPrevRound: (sid, kp, prev) => opts.wrong?.[`${sid}|${kp}|${prev}`] ?? [],
    doneIdsInRound: (sid, kp, mode, round) => opts.done?.[`${sid}|${kp}|${mode}|${round}`] ?? [],
    questionsByIds: (ids) => opts.primary.filter((q) => ids.includes(q.id)),
  };
}

const baseCtx: SelectorContext = {
  sessionId: "s1",
  bankId: "b1",
  kpId: "kp1",
  mode: "normal",
  roundIndex: 1,
};

describe("pickNextQuestionWith — normal", () => {
  it("无题池返回 null", () => {
    const ds = makeDS({ primary: [] });
    expect(pickNextQuestionWith(baseCtx, ds)).toBeNull();
  });
  it("按 difficulty 升序选最简单的题", () => {
    const ds = makeDS({
      primary: [
        { id: "q3", difficulty: 0.8 },
        { id: "q1", difficulty: 0.2 },
        { id: "q2", difficulty: 0.5 },
      ],
    });
    expect(pickNextQuestionWith(baseCtx, ds)?.id).toBe("q1");
  });
  it("difficulty 相同按 id 升序", () => {
    const ds = makeDS({
      primary: [
        { id: "qB", difficulty: 0.5 },
        { id: "qA", difficulty: 0.5 },
      ],
    });
    expect(pickNextQuestionWith(baseCtx, ds)?.id).toBe("qA");
  });
  it("已做题被排除", () => {
    const ds = makeDS({
      primary: [
        { id: "q1", difficulty: 0.2 },
        { id: "q2", difficulty: 0.5 },
      ],
      done: { "s1|kp1|normal|1": ["q1"] },
    });
    expect(pickNextQuestionWith(baseCtx, ds)?.id).toBe("q2");
  });
});

describe("pickNextQuestionWith — redo", () => {
  it("redo 与 normal 互不污染（不同 mode 的 done 不计入）", () => {
    const redoCtx: SelectorContext = { ...baseCtx, mode: "redo", roundIndex: 2 };
    const ds = makeDS({
      primary: [
        { id: "q1", difficulty: 0.2 },
        { id: "q2", difficulty: 0.5 },
      ],
      done: { "s1|kp1|normal|1": ["q1", "q2"] },
    });
    // redo 第二轮没做过，返回最简单的
    expect(pickNextQuestionWith(redoCtx, ds)?.id).toBe("q1");
  });
});

describe("pickNextQuestionWith — wrong-redo", () => {
  it("仅取上一 round 的错题", () => {
    const ctx: SelectorContext = { ...baseCtx, mode: "wrong-redo", roundIndex: 2 };
    const ds = makeDS({
      primary: [
        { id: "q1", difficulty: 0.2 },
        { id: "q2", difficulty: 0.5 },
        { id: "q3", difficulty: 0.8 },
      ],
      wrong: { "s1|kp1|1": ["q2", "q3"] },
    });
    const out = pickNextQuestionWith(ctx, ds);
    expect(out?.id).toBe("q2");
  });
  it("无错题返回 null", () => {
    const ctx: SelectorContext = { ...baseCtx, mode: "wrong-redo", roundIndex: 2 };
    const ds = makeDS({
      primary: [{ id: "q1", difficulty: 0.5 }],
      wrong: { "s1|kp1|1": [] },
    });
    expect(pickNextQuestionWith(ctx, ds)).toBeNull();
  });
  it("子轮再错进入下一子轮（roundIndex+1 时取上一子轮错题）", () => {
    const ctx: SelectorContext = { ...baseCtx, mode: "wrong-redo", roundIndex: 3 };
    const ds = makeDS({
      primary: [
        { id: "q1", difficulty: 0.2 },
        { id: "q2", difficulty: 0.5 },
      ],
      wrong: { "s1|kp1|2": ["q1"] }, // 上一子轮（round=2）错题
      done: { "s1|kp1|wrong-redo|3": [] },
    });
    expect(pickNextQuestionWith(ctx, ds)?.id).toBe("q1");
  });
});
