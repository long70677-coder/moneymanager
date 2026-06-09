import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData } from "@/lib/db";

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

  if (!batchNo) {
    return NextResponse.json({ error: "批號必填" }, { status: 400 });
  }

  let sql = `
    SELECT st.*, ba.account_purpose, ba.account_name
    FROM suspense_transactions st
    JOIN bank_accounts ba ON st.account_code = ba.account_code
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (suspenseDate) {
    sql += " AND st.suspense_date = ?";
    params.push(suspenseDate);
  }
  if (suspenseType && suspenseType !== "ALL") {
    sql += " AND st.suspense_type = ?";
    params.push(suspenseType);
  }
  if (currency && currency !== "ALL") {
    sql += " AND st.currency = ?";
    params.push(currency);
  }
  if (batchNo) {
    sql += " AND st.batch_no = ?";
    params.push(batchNo);
  }

  sql += " ORDER BY st.account_code, st.currency";

  const transactions = db.prepare(sql).all(...params);

  const batchConfirm = db.prepare(`
    SELECT * FROM batch_confirmations
    WHERE batch_no = ? LIMIT 1
  `).get(batchNo);

  return NextResponse.json({
    transactions,
    batchConfirmation: batchConfirm || null,
    total: transactions.length,
  });
}

// 新增暫收交易
export async function POST(request: NextRequest) {
  const db = initDb();
  const body = await request.json();
  const { suspenseDate, suspenseType, currency, batchNo } = body;

  if (!suspenseDate || !suspenseType || !currency) {
    return NextResponse.json({ error: "必填欄位未填" }, { status: 400 });
  }

  // 檢查日結
  const dayClosed = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE suspense_date = ? AND currency = ? AND is_day_closed = 1
  `).get(suspenseDate, currency) as { cnt: number };

  if (dayClosed.cnt > 0) {
    return NextResponse.json({ error: "作帳日該幣別已日結，不可新增" }, { status: 400 });
  }

  // 若為日常暫收，檢查通報鎖定
  if (suspenseType === "DAILY") {
    const reportLocked = db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE suspense_date = ? AND currency = ? AND is_report_locked = 1
    `).get(suspenseDate, currency) as { cnt: number };

    if (reportLocked.cnt > 0) {
      return NextResponse.json({ error: "已通報鎖定，不可新增日常暫收" }, { status: 400 });
    }
  }

  // 取得或生成批號
  let finalBatchNo = batchNo;
  if (!finalBatchNo) {
    const counterKey = `BATCH_${suspenseType}_${suspenseDate.replace(/-/g, "")}_${currency}`;
    const counter = db.prepare("SELECT current_value FROM sequence_counters WHERE counter_key = ?").get(counterKey) as { current_value: number } | undefined;
    const nextVal = (counter?.current_value || 0) + 1;
    finalBatchNo = `${suspenseDate.replace(/-/g, "")}${String(nextVal).padStart(3, "0")}`;

    db.prepare(`
      INSERT INTO sequence_counters (counter_key, current_value) VALUES (?, ?)
      ON CONFLICT(counter_key) DO UPDATE SET current_value = ?
    `).run(counterKey, nextVal, nextVal);
  }

  // 檢查批號是否已存在資料
  const existing = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND suspense_date = ? AND suspense_type = ? AND currency = ?
  `).get(finalBatchNo, suspenseDate, suspenseType, currency) as { cnt: number };

  if (existing.cnt > 0) {
    return NextResponse.json({ error: "指定批號已存在資料，不可新增" }, { status: 400 });
  }

  // 取得所有暫收帳戶
  const accounts = db.prepare(`
    SELECT * FROM bank_accounts WHERE is_suspense = 1
    AND (currency_type = ? OR (? = 'NTD' AND currency_type = 'TWD'))
  `).all(currency === "NTD" ? "TWD" : "FOREIGN", currency) as Array<Record<string, unknown>>;

  const prevDate = getPrevBusinessDay(suspenseDate);

  const insertTx = db.prepare(`
    INSERT INTO suspense_transactions
    (transaction_no, suspense_date, suspense_type, batch_no, bank_code, account_code, currency,
     prev_company_balance, prev_passbook_balance, today_company_balance, today_passbook_balance,
     total_suspense_amount, suspense_amount, exchange_rate, suspense_amount_local, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results: Array<Record<string, unknown>> = [];

  const insertAll = db.transaction(() => {
    let seq = 1;
    for (const account of accounts) {
      const txNo = `ST-${suspenseDate.replace(/-/g, "")}-${finalBatchNo}-${String(seq).padStart(3, "0")}`;

      let prevCompBal = 0, prevPassBal = 0, todayCompBal = 0, todayPassBal = 0;
      let suspenseAmount = 0, exchangeRate = 1;

      if (suspenseType === "DAILY") {
        const prevBalance = db.prepare(`
          SELECT balance FROM passbook_balances
          WHERE balance_date = ? AND account_code = ? AND currency = ? AND is_reviewed = 1
        `).get(prevDate, account.account_code, currency) as { balance: number } | undefined;

        prevPassBal = prevBalance?.balance || 0;
        prevCompBal = prevPassBal;
        suspenseAmount = prevPassBal - prevCompBal;
      } else if (suspenseType === "SECONDARY") {
        const todayBalance = db.prepare(`
          SELECT balance FROM passbook_balances
          WHERE balance_date = ? AND account_code = ? AND currency = ? AND is_reviewed = 1
        `).get(suspenseDate, account.account_code, currency) as { balance: number } | undefined;

        todayPassBal = todayBalance?.balance || 0;
        todayCompBal = todayPassBal;
        suspenseAmount = todayPassBal - todayCompBal;
      }
      // MANUAL: all zeros, user enters manually

      if (currency !== "NTD" && !(account.is_policy_account as number)) {
        exchangeRate = 31.5; // demo default
      }

      const suspenseAmountLocal = suspenseAmount * exchangeRate;
      const totalSuspense = suspenseAmount;

      insertTx.run(txNo, suspenseDate, suspenseType, finalBatchNo,
        account.bank_code, account.account_code, currency,
        prevCompBal, prevPassBal, todayCompBal, todayPassBal,
        totalSuspense, suspenseAmount, exchangeRate, suspenseAmountLocal,
        "System", "System");

      results.push({ transactionNo: txNo, accountCode: account.account_code });
      seq++;
    }

    // 建立批號確認狀態
    db.prepare(`
      INSERT OR IGNORE INTO batch_confirmations (suspense_date, currency, batch_type, batch_no, confirm_status)
      VALUES (?, ?, ?, ?, 'UNCONFIRMED')
    `).run(suspenseDate, currency, suspenseType, finalBatchNo);
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

  const updateTx = db.prepare(`
    UPDATE suspense_transactions
    SET suspense_amount = ?,
        suspense_amount_local = ? * exchange_rate,
        total_suspense_amount = ?,
        updated_by = ?,
        updated_at = datetime('now'),
        version = version + 1
    WHERE id = ? AND version = ? AND is_confirmed = 0 AND is_day_closed = 0
  `);

  let successCount = 0;
  let failCount = 0;

  const saveAll = db.transaction(() => {
    for (const tx of transactions) {
      const result = updateTx.run(tx.suspense_amount, tx.suspense_amount, tx.suspense_amount, "User", tx.id, tx.version);
      if (result.changes > 0) {
        successCount++;
      } else {
        failCount++;
      }
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

  if (!batchNo) {
    return NextResponse.json({ error: "批號必填" }, { status: 400 });
  }

  // 檢查是否已確認
  const confirmed = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND is_confirmed = 1
  `).get(batchNo) as { cnt: number };

  if (confirmed.cnt > 0) {
    return NextResponse.json({ error: "批號已確認，不得刪除" }, { status: 400 });
  }

  // 檢查是否已日結
  const dayClosed = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND is_day_closed = 1
  `).get(batchNo) as { cnt: number };

  if (dayClosed.cnt > 0) {
    return NextResponse.json({ error: "已日結，不得刪除" }, { status: 400 });
  }

  // 檢查通報鎖定
  const reportLocked = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND suspense_type = 'DAILY' AND is_report_locked = 1
  `).get(batchNo) as { cnt: number };

  if (reportLocked.cnt > 0) {
    return NextResponse.json({ error: "已通報鎖定之日常暫收不得刪除" }, { status: 400 });
  }

  const deleteAll = db.transaction(() => {
    const result = db.prepare("DELETE FROM suspense_transactions WHERE batch_no = ?").run(batchNo);
    db.prepare("DELETE FROM batch_confirmations WHERE batch_no = ?").run(batchNo);
    return result.changes;
  });

  const count = deleteAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 已刪除，共 ${count} 筆`,
    count,
  });
}

function getPrevBusinessDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split("T")[0];
}
