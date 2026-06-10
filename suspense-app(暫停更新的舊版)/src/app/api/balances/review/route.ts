import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { balanceRepo } from "@/repositories/balance.repo";

// 全批覆核：以餘額日期＋幣別為單位，覆核操作者可維護範圍內的存摺餘額
export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = await request.json();
  const { balanceDate, currency, userId, operator } = body as {
    balanceDate: string; currency: string; userId: number; operator?: string;
  };

  if (!balanceDate || !currency) {
    return NextResponse.json({ error: "餘額日期與幣別必填" }, { status: 400 });
  }

  const accessible = getAccessibleAccountCodes(db, userId, balanceDate);
  const count = balanceRepo.reviewBatch(db, balanceDate, currency, accessible, operator || "User");

  return NextResponse.json({ message: `已覆核 ${count} 筆存摺餘額`, count });
}
