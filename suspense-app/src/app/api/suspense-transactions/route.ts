import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { suspenseRepo } from "@/repositories/suspense.repo";
import { batchRepo } from "@/repositories/batch.repo";
import { accountRepo } from "@/repositories/account.repo";
import { sequenceRepo } from "@/repositories/sequence.repo";
import { balanceRepo } from "@/repositories/balance.repo";

function initDb() {
  const db = getDb();
  seedData(db);
  return db;
}

// 查詢暫收交易
export async function GET(request: NextRequest) {
  const db = initDb();
  const url = new URL(request.url);
  const suspenseDate = url.searchParams.get("suspenseDate");
  const suspenseType = url.searchParams.get("suspenseType");
  const currency = url.searchParams.get("currency");
  const batchNo = url.searchParams.get("batchNo");
  const userId = parseInt(url.searchParams.get("userId") || "0");

  // 批號非必填：留空時依日期／類型／幣別查詢符合條件的所有批號
  if (!currency || currency === "ALL") {
    return NextResponse.json({ error: "幣別必填（同一批號僅限單一幣別）" }, { status: 400 });
  }

  // 權限：經辦僅能看自己負責的帳號，主管看全部
  const accessible = getAccessibleAccountCodes(db, userId, suspenseDate || undefined);
  if (accessible !== null && accessible.length === 0) {
    return NextResponse.json({ batches: [], transactions: [], batchConfirmation: null, total: 0 });
  }

  const rows = suspenseRepo.findTransactions(db, {
    suspenseDate,
    suspenseType,
    currency,
    batchNo,
    accountCodes: accessible,
  });

  // 依批號分組為卡片
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const key = String(r.batch_no);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const batches = Array.from(grouped.entries()).map(([bNo, txs]) => ({
    batchNo: bNo,
    suspenseDate: txs[0].suspense_date,
    suspenseType: txs[0].suspense_type,
    currency: txs[0].currency,
    transactions: txs,
    batchConfirmation: batchRepo.findByBatchNo(db, bNo),
  }));

  // 向後相容：指定單一批號查詢時，仍回傳 transactions / batchConfirmation
  const single = batchNo ? batches[0] : null;

  return NextResponse.json({
    batches,
    transactions: single?.transactions ?? [],
    batchConfirmation: single?.batchConfirmation ?? null,
    total: rows.length,
  });
}

// 新增暫收交易
export async function POST(request: NextRequest) {
  const db = initDb();
  const body = await request.json();
  const { suspenseDate, suspenseType, currency, batchNo, userId } = body;

  if (!suspenseDate || !suspenseType || !currency) {
    return NextResponse.json({ error: "必填欄位未填（暫收日期、暫收類型、幣別）" }, { status: 400 });
  }

  // 檢查日結
  if (suspenseRepo.countDayClosed(db, suspenseDate, currency) > 0) {
    return NextResponse.json({ error: "作帳日該幣別已日結，不可新增" }, { status: 400 });
  }

  // 若為日常暫收，檢查通報鎖定
  if (suspenseType === "DAILY") {
    if (suspenseRepo.countReportLocked(db, suspenseDate, currency) > 0) {
      return NextResponse.json({ error: "已通報鎖定，不可新增日常暫收" }, { status: 400 });
    }
  }

  // 取得或生成批號
  let finalBatchNo = batchNo;
  if (!finalBatchNo) {
    const counterKey = `BATCH_${suspenseType}_${suspenseDate.replace(/-/g, "")}_${currency}`;
    const nextVal = (sequenceRepo.getValue(db, counterKey) || 0) + 1;
    finalBatchNo = `${suspenseDate.replace(/-/g, "")}${String(nextVal).padStart(3, "0")}`;
    sequenceRepo.setValue(db, counterKey, nextVal);
  }

  // 檢查批號是否已存在資料
  if (suspenseRepo.countExisting(db, finalBatchNo, suspenseDate, suspenseType, currency) > 0) {
    return NextResponse.json({ error: "指定批號已存在資料，不可新增" }, { status: 400 });
  }

  // 單一批號僅限單一幣別：若同批號已被其他幣別使用，拒絕
  const otherCurrency = suspenseRepo.findOtherCurrency(db, finalBatchNo, currency);
  if (otherCurrency) {
    return NextResponse.json({ error: `批號 ${finalBatchNo} 已用於幣別 ${otherCurrency}，同一批號不可混用不同幣別` }, { status: 400 });
  }

  // 取得所有暫收帳戶
  let accounts = accountRepo.findSuspenseByCurrency(db, currency);

  // 權限：經辦僅能對自己負責的帳號立暫收，主管不限
  const accessible = getAccessibleAccountCodes(db, userId || 0, suspenseDate);
  if (accessible !== null) {
    const allowed = new Set(accessible);
    accounts = accounts.filter(a => allowed.has(a.account_code as string));
    if (accounts.length === 0) {
      return NextResponse.json({ error: "您沒有可立暫收的帳號（請確認帳號維護權限）" }, { status: 403 });
    }
  }

  const prevDate = getPrevBusinessDay(suspenseDate);
  const results: Array<Record<string, unknown>> = [];

  const insertAll = db.transaction(() => {
    let seq = 1;
    for (const account of accounts) {
      const txNo = `ST-${suspenseDate.replace(/-/g, "")}-${finalBatchNo}-${String(seq).padStart(3, "0")}`;

      let prevCompBal = 0, prevPassBal = 0, todayCompBal = 0, todayPassBal = 0;
      let suspenseAmount = 0, exchangeRate = 1;

      if (suspenseType === "DAILY") {
        prevPassBal = balanceRepo.findReviewedBalance(db, prevDate, account.account_code as string, currency) || 0;
        prevCompBal = prevPassBal;
        suspenseAmount = prevPassBal - prevCompBal;
      } else if (suspenseType === "SECONDARY") {
        todayPassBal = balanceRepo.findReviewedBalance(db, suspenseDate, account.account_code as string, currency) || 0;
        todayCompBal = todayPassBal;
        suspenseAmount = todayPassBal - todayCompBal;
      }
      // MANUAL: all zeros, user enters manually

      if (currency !== "NTD" && !(account.is_policy_account as number)) {
        exchangeRate = 31.5; // demo default
      }

      const suspenseAmountLocal = suspenseAmount * exchangeRate;
      const totalSuspense = suspenseAmount;

      suspenseRepo.insert(db, {
        transaction_no: txNo,
        suspense_date: suspenseDate,
        suspense_type: suspenseType,
        batch_no: finalBatchNo,
        bank_code: account.bank_code as string,
        account_code: account.account_code as string,
        currency,
        prev_company_balance: prevCompBal,
        prev_passbook_balance: prevPassBal,
        today_company_balance: todayCompBal,
        today_passbook_balance: todayPassBal,
        total_suspense_amount: totalSuspense,
        suspense_amount: suspenseAmount,
        exchange_rate: exchangeRate,
        suspense_amount_local: suspenseAmountLocal,
        created_by: "System",
        updated_by: "System",
      });

      results.push({ transactionNo: txNo, accountCode: account.account_code });
      seq++;
    }

    // 建立批號確認狀態
    batchRepo.insertIgnore(db, { suspenseDate, currency, batchType: suspenseType, batchNo: finalBatchNo });
  });

  insertAll();

  return NextResponse.json({
    message: `批號 ${finalBatchNo} 新增成功，共 ${results.length} 筆`,
    batchNo: finalBatchNo,
    count: results.length,
  });
}

// 儲存暫收交易
export async function PUT(request: NextRequest) {
  const db = initDb();
  const body = await request.json();
  const { transactions } = body as { transactions: Array<{ id: number; suspense_amount: number; version: number }> };

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ error: "無資料可儲存" }, { status: 400 });
  }

  let successCount = 0;
  let failCount = 0;

  const saveAll = db.transaction(() => {
    for (const tx of transactions) {
      const changes = suspenseRepo.updateAmount(db, {
        id: tx.id,
        suspense_amount: tx.suspense_amount,
        version: tx.version,
        updated_by: "User",
      });
      if (changes > 0) successCount++;
      else failCount++;
    }
  });

  saveAll();

  return NextResponse.json({
    message: `儲存完成：成功 ${successCount} 筆${failCount > 0 ? `，失敗 ${failCount} 筆（可能已確認、已日結或版本衝突）` : ""}`,
    successCount,
    failCount,
  });
}

// 刪除暫收交易（整批刪除）
export async function DELETE(request: NextRequest) {
  const db = initDb();
  const url = new URL(request.url);
  const batchNo = url.searchParams.get("batchNo");
  const userId = parseInt(url.searchParams.get("userId") || "0");

  if (!batchNo) {
    return NextResponse.json({ error: "批號必填" }, { status: 400 });
  }

  const ownErr = ensureBatchOwnership(db, batchNo, userId);
  if (ownErr) return NextResponse.json({ error: ownErr }, { status: 403 });

  // 檢查是否已確認
  if (suspenseRepo.countConfirmedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "批號已確認，不得刪除" }, { status: 400 });
  }

  // 檢查是否已日結
  if (suspenseRepo.countDayClosedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "已日結，不得刪除" }, { status: 400 });
  }

  // 檢查通報鎖定
  if (suspenseRepo.countDailyReportLockedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "已通報鎖定之日常暫收不得刪除" }, { status: 400 });
  }

  const deleteAll = db.transaction(() => {
    const changes = suspenseRepo.deleteByBatch(db, batchNo);
    batchRepo.deleteByBatch(db, batchNo);
    return changes;
  });

  const count = deleteAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 已刪除，共 ${count} 筆`,
    count,
  });
}

/**
 * 確認使用者有權操作整批：經辦需該批所有帳號皆為其可維護範圍，否則回傳錯誤訊息；主管不限。
 */
export function ensureBatchOwnership(
  db: ReturnType<typeof getDb>,
  batchNo: string,
  userId: number
): string | null {
  const refDate = suspenseRepo.findRefDateByBatch(db, batchNo);
  const accessible = getAccessibleAccountCodes(db, userId, refDate);
  if (accessible === null) return null; // 主管

  const accounts = suspenseRepo.distinctAccountCodesByBatch(db, batchNo);
  const allowed = new Set(accessible);
  if (accounts.some(code => !allowed.has(code))) {
    return "此批號包含您無權維護的帳號，無法操作";
  }
  return null;
}

function getPrevBusinessDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split("T")[0];
}
