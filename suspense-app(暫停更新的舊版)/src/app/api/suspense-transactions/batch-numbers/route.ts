import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { suspenseRepo } from "@/repositories/suspense.repo";

// 取得指定暫收日期下已存在的批號清單（供批號欄位下拉選單）
export async function GET(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const url = new URL(request.url);
  const suspenseDate = url.searchParams.get("suspenseDate");
  const userId = parseInt(url.searchParams.get("userId") || "0");

  if (!suspenseDate) {
    return NextResponse.json({ batchNumbers: [] });
  }

  // 權限：經辦僅列出自己負責帳號的批號，主管列出全部
  const accessible = getAccessibleAccountCodes(db, userId, suspenseDate);
  if (accessible !== null && accessible.length === 0) {
    return NextResponse.json({ batchNumbers: [] });
  }

  const batchNumbers = suspenseRepo.findBatchNumbersByDate(db, suspenseDate, accessible);
  return NextResponse.json({ batchNumbers });
}
