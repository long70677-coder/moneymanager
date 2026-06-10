import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { suspenseRepo } from "@/repositories/suspense.repo";
import { batchRepo } from "@/repositories/batch.repo";
import { accountRepo } from "@/repositories/account.repo";
import { voucherRepo } from "@/repositories/voucher.repo";
import { reportRepo } from "@/repositories/report.repo";

// 批號確認
export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = await request.json();
  const { batchNo, suspenseDate, currency, batchType, operator, userId } = body;

  if (!batchNo) {
    return NextResponse.json({ error: "批號必填" }, { status: 400 });
  }

  // 權限：經辦需該批所有帳號皆為其可維護範圍
  const accessible = getAccessibleAccountCodes(db, userId || 0, suspenseDate);
  if (accessible !== null) {
    const allowed = new Set(accessible);
    const accts = suspenseRepo.distinctAccountCodesByBatch(db, batchNo);
    if (accts.some(code => !allowed.has(code))) {
      return NextResponse.json({ error: "此批號包含您無權維護的帳號，無法確認" }, { status: 403 });
    }
  }

  // 檢查是否已日結
  if (suspenseRepo.countDayClosedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "已日結，不得確認" }, { status: 400 });
  }

  // 檢查是否已被刪除
  if (suspenseRepo.countByBatch(db, batchNo) === 0) {
    return NextResponse.json({ error: "已被刪除，不得確認" }, { status: 400 });
  }

  // 檢查通報鎖定（僅日常暫收）
  if (batchType === "DAILY") {
    if (suspenseRepo.countDailyReportLockedByBatch(db, batchNo) > 0) {
      return NextResponse.json({ error: "已通報鎖定，不得確認日常暫收" }, { status: 400 });
    }
  }

  const confirmAll = db.transaction(() => {
    // 更新交易與批號確認狀態
    suspenseRepo.setConfirmedByBatch(db, batchNo, operator || "System", true);
    batchRepo.markConfirmed(db, batchNo, operator || "System");

    // 產生傳票
    const transactions = suspenseRepo.findNonZeroByBatch(db, batchNo);

    let voucherSeq = 1;
    for (const tx of transactions) {
      const voucherNo = `V-${batchNo}-${String(voucherSeq).padStart(3, "0")}`;
      const isDebit = (tx.suspense_amount as number) >= 0;
      const accountingCode = (tx.currency as string) === "NTD" ? "1131" : "1132";
      const amount = Math.abs(tx.suspense_amount as number);
      const amountLocal = Math.abs(tx.suspense_amount_local as number);

      const longCode = accountRepo.findLongCode(db, tx.account_code as string);
      const summary = `暫收 批號:${batchNo} 帳號:${longCode || tx.account_code}`;

      // 借方
      voucherRepo.insert(db, {
        voucher_no: voucherNo, suspense_date: tx.suspense_date as string, batch_no: batchNo,
        batch_type: tx.suspense_type as string, account_code: tx.account_code as string, currency: tx.currency as string,
        debit_credit: isDebit ? "D" : "C", accounting_code: accountingCode, amount, amount_local: amountLocal,
        summary, created_by: operator || "System",
      });

      // 貸方
      voucherRepo.insert(db, {
        voucher_no: voucherNo, suspense_date: tx.suspense_date as string, batch_no: batchNo,
        batch_type: tx.suspense_type as string, account_code: tx.account_code as string, currency: tx.currency as string,
        debit_credit: isDebit ? "C" : "D", accounting_code: accountingCode === "1131" ? "2141" : "2142",
        amount, amount_local: amountLocal, summary, created_by: operator || "System",
      });

      voucherSeq++;
    }

    // 日常暫收 → 產生通報明細
    const dailyTxs = transactions.filter(t => t.suspense_type === "DAILY");
    for (const tx of dailyTxs) {
      reportRepo.insertDebit(db, {
        suspense_date: tx.suspense_date as string, batch_no: batchNo, account_code: tx.account_code as string,
        currency: tx.currency as string, item_code: "SUSP-001", amount: Math.abs(tx.suspense_amount as number),
        created_by: operator || "System",
      });
    }

    return transactions.length;
  });

  const count = confirmAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 確認成功，產生 ${count} 筆傳票`,
    confirmed: true,
  });
}
