import { NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";
import { userRepo } from "@/repositories/user.repo";

// 取得使用者清單（供前端切換目前操作者，作為登入機制的 demo 替身）
export async function GET() {
  const db = getDb();
  seedData(db);
  const users = userRepo.findAll(db);
  return NextResponse.json({ users });
}
