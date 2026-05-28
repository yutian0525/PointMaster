import ExcelJS from "exceljs";
import { ParsedQuestion } from "@/types";

const CONTENT_HEADERS = ["题目", "题干", "question", "内容"];
const OPTION_A_HEADERS = ["a", "选项a", "a选项"];
const OPTION_B_HEADERS = ["b", "选项b", "b选项"];
const OPTION_C_HEADERS = ["c", "选项c", "c选项"];
const OPTION_D_HEADERS = ["d", "选项d", "d选项"];
const ANSWER_HEADERS = ["答案", "answer", "正确答案"];
const ANALYSIS_HEADERS = ["解析", "analysis", "详解"];

export async function parseExcel(buffer: Buffer): Promise<ParsedQuestion[]> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel 文件中没有工作表");

  const headerRow = sheet.getRow(1);
  const colMap: Record<string, number> = {};

  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || "").toLowerCase().trim();
    if (CONTENT_HEADERS.includes(val)) colMap.content = colNumber;
    if (OPTION_A_HEADERS.includes(val)) colMap.a = colNumber;
    if (OPTION_B_HEADERS.includes(val)) colMap.b = colNumber;
    if (OPTION_C_HEADERS.includes(val)) colMap.c = colNumber;
    if (OPTION_D_HEADERS.includes(val)) colMap.d = colNumber;
    if (ANSWER_HEADERS.includes(val)) colMap.answer = colNumber;
    if (ANALYSIS_HEADERS.includes(val)) colMap.analysis = colNumber;
  });

  if (!colMap.content || !colMap.answer) {
    throw new Error("Excel 表头缺少必要列（题目、答案）");
  }

  const questions: ParsedQuestion[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const content = String(row.getCell(colMap.content).value || "").trim();
    if (!content) return;

    const options: string[] = [];
    if (colMap.a) options.push(String(row.getCell(colMap.a).value || ""));
    if (colMap.b) options.push(String(row.getCell(colMap.b).value || ""));
    if (colMap.c) options.push(String(row.getCell(colMap.c).value || ""));
    if (colMap.d) options.push(String(row.getCell(colMap.d).value || ""));

    const answer = String(row.getCell(colMap.answer).value || "").trim();
    const analysis = colMap.analysis
      ? String(row.getCell(colMap.analysis).value || "").trim() || undefined
      : undefined;

    questions.push({ content, options, answer, analysis });
  });

  return questions;
}
