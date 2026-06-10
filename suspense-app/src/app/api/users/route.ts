import { NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";

// 取得使用者清單（供前端切換目前操作者，作為登入機制的 demo 替身）
export async function GET() {
  const db = getDb();
  seedData(db);
  const users = db.prepare("SELECT id, user_code, user_name, role FROM users ORDER BY role DESC, user_code").all();
  return NextResponse.json({ users });
}
