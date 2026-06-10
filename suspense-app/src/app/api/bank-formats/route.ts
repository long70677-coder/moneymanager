import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";
import { bankFormatRepo, type ProfileInput } from "@/repositories/bankFormat.repo";

// 銀行格式設定維護：列表 / 新增 / 修改 / 刪除
export async function GET() {
  const db = getDb();
  seedData(db);
  return NextResponse.json({ profiles: bankFormatRepo.list(db) });
}

function validate(body: Partial<ProfileInput>): string | null {
  if (!body.bank_code) return "銀行代碼必填";
  if (!body.currency) return "幣別必填（可用 ZZZ 表共用）";
  if (!body.engine) return "解析引擎必填";
  const cm = body.column_map;
  if (!cm || !cm.balanceDate?.key || !cm.balance?.key) return "欄位對應至少需設定「餘額日期」與「餘額」";
  return null;
}

export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = (await request.json()) as ProfileInput;
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    const id = bankFormatRepo.create(db, body);
    return NextResponse.json({ message: `已新增格式設定（${body.bank_code}／${body.currency}）`, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "新增失敗（可能銀行+幣別+版本重複）" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = (await request.json()) as ProfileInput & { id: number };
  if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const changes = bankFormatRepo.update(db, body.id, body);
  return NextResponse.json({ message: changes > 0 ? "已更新格式設定" : "查無資料", changes });
}

export async function DELETE(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const id = parseInt(new URL(request.url).searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const changes = bankFormatRepo.remove(db, id);
  return NextResponse.json({ message: changes > 0 ? "已刪除格式設定" : "查無資料", changes });
}
