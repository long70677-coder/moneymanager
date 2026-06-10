import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";
import { ingestFile } from "@/services/ingest.service";
import { importLogRepo } from "@/repositories/importLog.repo";
import type { ImportResult } from "@/domain/ingest.types";

// 存摺餘額轉檔：多檔上傳 → 逐檔解析/檢核/寫入 → 轉檔歷程
export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const balanceDate = String(form.get("balanceDate") || "");
  const userId = parseInt(String(form.get("userId") || "0"), 10);
  const secondImport = String(form.get("secondImport") || "") === "true";
  const operator = String(form.get("operator") || "User");

  if (files.length === 0) return NextResponse.json({ error: "未選擇檔案" }, { status: 400 });
  if (!balanceDate) return NextResponse.json({ error: "餘額日期必填" }, { status: 400 });

  // 議題3#1：同批多檔不得有重複檔名
  const names = files.map(f => f.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return NextResponse.json({ error: `上傳檔案有重複檔名：${dup}` }, { status: 400 });

  const batchId = `IMP-${Date.now()}`;
  const results: ImportResult[] = [];

  for (const file of files) {
    const content = Buffer.from(await file.arrayBuffer());
    const result = ingestFile(db, {
      fileName: file.name, content, screenBalanceDate: balanceDate, userId, secondImport, operator,
    });
    importLogRepo.insert(db, batchId, result, operator);
    results.push(result);
  }

  const totals = results.reduce(
    (a, r) => ({ success: a.success + r.success, fail: a.fail + r.fail }),
    { success: 0, fail: 0 },
  );

  return NextResponse.json({
    batchId,
    fileCount: results.length,
    totalSuccess: totals.success,
    totalFail: totals.fail,
    results,
  });
}
