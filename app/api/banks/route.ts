import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questionBanks, questions } from "@/lib/db/schema";
import { parseFile } from "@/lib/parsers";
import { v4 as uuid } from "uuid";
import { desc } from "drizzle-orm";
import path from "path";
import fs from "fs";

export async function GET() {
  const banks = db.select().from(questionBanks).orderBy(desc(questionBanks.createdAt)).all();
  return NextResponse.json(banks);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 });
  }

  const fileName = file.name;
  const bankName = name || fileName.replace(/\.[^.]+$/, "");

  // Save file to disk
  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const savedFileName = `${Date.now()}-${fileName}`;
  fs.writeFileSync(path.join(uploadsDir, savedFileName), buffer);

  // Parse file
  let parsedQuestions;
  try {
    parsedQuestions = await parseFile(buffer, fileName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (parsedQuestions.length === 0) {
    return NextResponse.json({ error: "未从文件中提取到任何题目" }, { status: 400 });
  }

  // Create bank record
  const bankId = uuid();
  const now = Date.now();

  db.insert(questionBanks)
    .values({
      id: bankId,
      name: bankName,
      fileName: savedFileName,
      totalQuestions: parsedQuestions.length,
      status: "pending",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Insert questions
  for (const q of parsedQuestions) {
    db.insert(questions)
      .values({
        id: uuid(),
        bankId,
        content: q.content,
        options: JSON.stringify(q.options),
        answer: q.answer,
        analysis: q.analysis || null,
        aiExtracted: 0,
        createdAt: now,
      })
      .run();
  }

  return NextResponse.json({ id: bankId, totalQuestions: parsedQuestions.length }, { status: 201 });
}
