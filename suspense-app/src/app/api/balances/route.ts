import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { accountRepo } from "@/repositories/account.repo";
import { balanceRepo } from "@/repositories/balance.repo";
import { ledgerBalanceRepo } from "@/repositories/ledgerBalance.repo";

// 餘額維護畫面資料：以帳號為基礎，帶出帳列餘額(唯讀)＋存摺轉入餘額(可改)
export async function GET(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const url = new URL(request.url);
  const balanceDate = url.searchParams.get("balanceDate") || "";
  const currency = url.searchParams.get("currency") || "";
  const userId = parseInt(url.searchParams.get("userId") || "0", 10);

  if (!balanceDate || !currency) {
    return NextResponse.json({ error: "餘額日期與幣別必填" }, { status: 400 });
  }

  const accessible = getAccessibleAccountCodes(db, userId, balanceDate);
  if (accessible !== null && accessible.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  let accounts = accountRepo.findSuspenseByCurrency(db, currency);
  if (accessible !== null) {
    const allow = new Set(accessible);
    accounts = accounts.filter(a => allow.has(a.account_code as string));
  }

  const rows = accounts.map(a => {
    const code = a.account_code as string;
    const ledger = ledgerBalanceRepo.findBalance(db, balanceDate, code, currency);
    const pb = balanceRepo.getLatest(db, balanceDate, code, currency);
    return {
      accountCode: code,
      accountName: a.account_name,
      accountPurpose: a.account_purpose,
      currency,
      ledgerBalance: ledger ?? null,
      passbookBalance: pb ? (pb.balance as number) : null,
      dataType: pb ? (pb.data_type as string) : null,
      importSeq: pb ? (pb.import_seq as number) : null,
      isReviewed: pb ? (pb.is_reviewed as number) : 0,
      diff: pb && ledger != null ? (pb.balance as number) - ledger : null,
    };
  });

  return NextResponse.json({ rows });
}

// 儲存人工調整的存摺餘額（勾選編輯的列）；人工改過 → data_type=MANUAL
export async function PUT(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = await request.json();
  const { balanceDate, currency, userId, operator, edits } = body as {
    balanceDate: string; currency: string; userId: number; operator?: string;
    edits: Array<{ accountCode: string; balance: number }>;
  };

  if (!balanceDate || !currency || !edits?.length) {
    return NextResponse.json({ error: "無可儲存的資料" }, { status: 400 });
  }

  const accessible = getAccessibleAccountCodes(db, userId, balanceDate);
  const allow = accessible === null ? null : new Set(accessible);
  const who = operator || "User";

  let saved = 0;
  const save = db.transaction(() => {
    for (const e of edits) {
      if (allow && !allow.has(e.accountCode)) continue; // 無權限略過
      const latest = balanceRepo.getLatest(db, balanceDate, e.accountCode, currency);
      if (latest) {
        balanceRepo.updateManualById(db, latest.id as number, { balance: e.balance, updatedBy: who });
      } else {
        balanceRepo.insertManual(db, { balanceDate, accountCode: e.accountCode, currency, balance: e.balance, createdBy: who });
      }
      saved++;
    }
  });
  save();

  return NextResponse.json({ message: `已儲存 ${saved} 筆存摺餘額（改為人工輸入）`, saved });
}
