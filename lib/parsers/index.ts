import { ParsedQuestion } from "@/types";
import { parseExcel } from "./excel";
import { parseJSON } from "./json";
import { parseTXT } from "./txt";

export async function parseFile(
  buffer: Buffer,
  fileName: string
): Promise<ParsedQuestion[]> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "xlsx":
    case "xls":
      return parseExcel(buffer);
    case "json":
      return parseJSON(buffer.toString("utf-8"));
    case "txt":
      return parseTXT(buffer.toString("utf-8"));
    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}
