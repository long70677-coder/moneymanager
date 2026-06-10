import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";
import { previewFile } from "@/services/ingest.service";

// 試轉預覽（dry-run）：解析單一樣本檔但不寫入，回傳解析結果與錯誤
export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "未選擇檔案" }, { status: 400 });
  }
  const content = Buffer.from(await file.arrayBuffer());
  const result = previewFile(db, file.name, content);
  return NextResponse.json(result);
}
