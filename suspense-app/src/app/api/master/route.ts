import { NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";
import { accountRepo } from "@/repositories/account.repo";
import { userRepo } from "@/repositories/user.repo";

// 基本資料查詢：銀行存款帳號基本資料 + 使用者帳號與帳號維護權限（唯讀，供檢視）
export async function GET() {
  const db = getDb();
  seedData(db);

  const accounts = accountRepo.findAll(db);
  const users = userRepo.findAll(db) as Array<{ id: number; user_code: string; user_name: string; role: string }>;

  // 每位使用者所維護的帳號（主管不限，回空陣列由前端顯示「全部」）
  const usersWithAccounts = users.map(u => ({
    ...u,
    accounts: u.role === "MANAGER" ? [] : userRepo.findManagedAccounts(db, u.id),
  }));

  return NextResponse.json({ accounts, users: usersWithAccounts });
}
