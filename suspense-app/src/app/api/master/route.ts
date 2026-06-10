import { NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";

// 基本資料查詢：銀行存款帳號基本資料 + 使用者帳號與帳號維護權限（唯讀，供檢視）
export async function GET() {
  const db = getDb();
  seedData(db);

  const accounts = db.prepare(`
    SELECT id, account_code, account_long_code, bank_code, account_name, account_purpose,
           is_suspense, is_policy_account, currency_type
    FROM bank_accounts
    ORDER BY account_code
  `).all();

  const users = db.prepare(`
    SELECT id, user_code, user_name, role
    FROM users
    ORDER BY role DESC, user_code
  `).all() as Array<{ id: number; user_code: string; user_name: string; role: string }>;

  // 每位使用者所維護的帳號（含主辦/代理與有效期間）
  const mgrStmt = db.prepare(`
    SELECT am.account_code, am.manager_type, am.valid_from, am.valid_to, ba.account_name
    FROM account_managers am
    LEFT JOIN bank_accounts ba ON am.account_code = ba.account_code
    WHERE am.user_id = ?
    ORDER BY am.manager_type DESC, am.account_code
  `);

  const usersWithAccounts = users.map(u => ({
    ...u,
    accounts: u.role === "MANAGER" ? [] : mgrStmt.all(u.id),
  }));

  return NextResponse.json({ accounts, users: usersWithAccounts });
}
