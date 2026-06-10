import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";

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
    const accts = db.prepare("SELECT DISTINCT account_code FROM suspense_transactions WHERE batch_no = ?").all(batchNo) as Array<{ account_code: string }>;
    if (accts.some(a => !allowed.has(a.account_code))) {
      return NextResponse.json({ error: "此批號包含您無權維護的帳號，無法確認" }, { status: 403 });
    }
  }

  // 檢查是否已日結
  const dayClosed = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND is_day_closed = 1
  `).get(batchNo) as { cnt: number };

  if (dayClosed.cnt > 0) {
    return NextResponse.json({ error: "已日結，不得確認" }, { status: 400 });
  }

  // 檢查是否已被刪除
  const exists = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions WHERE batch_no = ?
  `).get(batchNo) as { cnt: number };

  if (exists.cnt === 0) {
    return NextResponse.json({ error: "已被刪除，不得確認" }, { status: 400 });
  }

  // 檢查通報鎖定（僅日常暫收）
  if (batchType === "DAILY") {
    const reportLocked = db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE batch_no = ? AND suspense_type = 'DAILY' AND is_report_locked = 1
    `).get(batchNo) as { cnt: number };

    if (reportLocked.cnt > 0) {
      return NextResponse.json({ error: "已通報鎖定，不得確認日常暫收" }, { status: 400 });
    }
  }

  const confirmAll = db.transaction(() => {
    // 更新交易確認狀態
    db.prepare(`
      UPDATE suspense_transactions SET is_confirmed = 1, updated_by = ?, updated_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator || "System", batchNo);

    // 更新批號確認狀態
    db.prepare(`
      UPDATE batch_confirmations
      SET confirm_status = 'CONFIRMED', confirmed_by = ?, confirmed_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator || "System", batchNo);

    // 產生傳票
    const transactions = db.prepare(`
      SELECT * FROM suspense_transactions WHERE batch_no = ? AND suspense_amount != 0
    `).all(batchNo) as Array<Record<string, unknown>>;

    const insertVoucher = db.prepare(`
      INSERT INTO voucher_entries (voucher_no, suspense_date, batch_no, batch_type, account_code, currency, debit_credit, accounting_code, amount, amount_local, summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let voucherSeq = 1;
    for (const tx of transactions) {
      const voucherNo = `V-${batchNo}-${String(voucherSeq).padStart(3, "0")}`;
      const isDebit = (tx.suspense_amount as number) >= 0;
      const accountingCode = (tx.currency as string) === "NTD" ? "1131" : "1132";
      const amount = Math.abs(tx.suspense_amount as number);
      const amountLocal = Math.abs(tx.suspense_amount_local as number);

      const bankAccount = db.prepare("SELECT account_long_code FROM bank_accounts WHERE account_code = ?").get(tx.account_code) as { account_long_code: string };
      const summary = `暫收 批號:${batchNo} 帳號:${bankAccount?.account_long_code || tx.account_code}`;

      // 借方
      insertVoucher.run(voucherNo, tx.suspense_date, batchNo, tx.suspense_type, tx.account_code, tx.currency,
        isDebit ? "D" : "C", accountingCode, amount, amountLocal, summary, operator || "System");

      // 貸方
      insertVoucher.run(voucherNo, tx.suspense_date, batchNo, tx.suspense_type, tx.account_code, tx.currency,
        isDebit ? "C" : "D", accountingCode === "1131" ? "2141" : "2142", amount, amountLocal, summary, operator || "System");

      voucherSeq++;
    }

    // 日常暫收 → 產生通報明細
    const dailyTxs = transactions.filter(t => t.suspense_type === "DAILY");
    if (dailyTxs.length > 0) {
      const insertReport = db.prepare(`
        INSERT INTO report_details (suspense_date, batch_no, account_code, currency, item_code, debit_credit, amount, report_source, created_by)
        VALUES (?, ?, ?, ?, ?, 'D', ?, '5', ?)
      `);

      for (const tx of dailyTxs) {
        insertReport.run(tx.suspense_date, batchNo, tx.account_code, tx.currency, "SUSP-001",
          Math.abs(tx.suspense_amount as number), operator || "System");
      }
    }

    return transactions.length;
  });

  const count = confirmAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 確認成功，產生 ${count} 筆傳票`,
    confirmed: true,
  });
}
