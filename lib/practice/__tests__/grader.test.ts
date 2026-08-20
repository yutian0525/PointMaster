import { describe, it, expect } from "vitest";
import { grade, normalizeAnswer } from "../grader";

describe("normalizeAnswer 单选/多选", () => {
  it("基础大写排序去重", () => {
    expect(normalizeAnswer("ba", "多选题")).toBe("AB");
    expect(normalizeAnswer("A,B,C", "多选题")).toBe("ABC");
    expect(normalizeAnswer("BCAB", "多选题")).toBe("ABC");
    expect(normalizeAnswer("a b c", "多选题")).toBe("ABC");
  });
  it("单选去掉非字母", () => {
    expect(normalizeAnswer(" b ", "单选题")).toBe("B");
    expect(normalizeAnswer("(B)", "单选题")).toBe("B");
  });
});

describe("normalizeAnswer 判断题", () => {
  it("常见输入归一", () => {
    expect(normalizeAnswer("对", "判断题")).toBe("对");
    expect(normalizeAnswer("正确", "判断题")).toBe("对");
    expect(normalizeAnswer("A", "判断题")).toBe("对");
    expect(normalizeAnswer("true", "判断题")).toBe("对");
    expect(normalizeAnswer("错", "判断题")).toBe("错");
    expect(normalizeAnswer("B", "判断题")).toBe("错");
    expect(normalizeAnswer("false", "判断题")).toBe("错");
  });
});

describe("grade", () => {
  it("单选正确/错误", () => {
    expect(grade("B", "B", "单选题")).toBe(1);
    expect(grade("A", "B", "单选题")).toBe(0);
  });
  it("多选部分对部分错给 0 分", () => {
    expect(grade("AB", "ABC", "多选题")).toBe(0);
    expect(grade("ABCD", "ABC", "多选题")).toBe(0);
    expect(grade("ABC", "ABC", "多选题")).toBe(1);
    expect(grade("CBA", "ABC", "多选题")).toBe(1);
  });
  it("判断题归一后判分", () => {
    expect(grade("正确", "对", "判断题")).toBe(1);
    expect(grade("错误", "对", "判断题")).toBe(0);
  });
  it("空输入判 0", () => {
    expect(grade("", "B", "单选题")).toBe(0);
  });
});
