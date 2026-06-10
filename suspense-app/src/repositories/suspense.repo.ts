import type { DB } from "./_db";

/**
 * suspense_transactions 資料存取層。
 * 唯一允許對 suspense_transactions 下 SQL 的地方；不含任何業務判斷。
 */

export interface FindTransactionsFilter {
  suspenseDate?: string | null;
  suspenseType?: string | null; // "ALL" 視為不過濾
  currency: string;
  batchNo?: string | null;
  /** null = 不過濾（主管）；string[] = 僅這些帳號（呼叫端須先處理空陣列） */
  accountCodes?: string[] | null;
}

export interface InsertTransactionRow {
  transaction_no: string;
  suspense_date: string;
  suspense_type: string;
  batch_no: string;
  bank_code: string;
  account_code: string;
  currency: string;
  prev_company_balance: number;
  prev_passbook_balance: number;
  today_company_balance: number;
  today_passbook_balance: number;
  total_suspense_amount: number;
  suspense_amount: number;
  exchange_rate: number;
  suspense_amount_local: number;
  created_by: string;
  updated_by: string;
}

type Row = Record<string, unknown>;

export const suspenseRepo = {
  /** 依條件查詢交易（含 bank_accounts join 的 account_purpose / account_name）。 */
  findTransactions(db: DB, f: FindTransactionsFilter): Row[] {
    let sql = `
      SELECT st.*, ba.account_purpose, ba.account_name
      FROM suspense_transactions st
      JOIN bank_accounts ba ON st.account_code = ba.account_code
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (f.suspenseDate) {
      sql += " AND st.suspense_date = ?";
      params.push(f.suspenseDate);
    }
    if (f.suspenseType && f.suspenseType !== "ALL") {
      sql += " AND st.suspense_type = ?";
      params.push(f.suspenseType);
    }
    sql += " AND st.currency = ?";
    params.push(f.currency);
    if (f.batchNo) {
      sql += " AND st.batch_no = ?";
      params.push(f.batchNo);
    }
    if (f.accountCodes != null) {
      sql += ` AND st.account_code IN (${f.accountCodes.map(() => "?").join(",")})`;
      params.push(...f.accountCodes);
    }
    sql += " ORDER BY st.batch_no, st.account_code";

    return db.prepare(sql).all(...params) as Row[];
  },

  /** 該作帳日該幣別已日結的筆數。 */
  countDayClosed(db: DB, suspenseDate: string, currency: string): number {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE suspense_date = ? AND currency = ? AND is_day_closed = 1
    `).get(suspenseDate, currency) as { cnt: number }).cnt;
  },

  /** 該作帳日該幣別已通報鎖定的筆數。 */
  countReportLocked(db: DB, suspenseDate: string, currency: string): number {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE suspense_date = ? AND currency = ? AND is_report_locked = 1
    `).get(suspenseDate, currency) as { cnt: number }).cnt;
  },

  /** 指定批號＋日期＋類型＋幣別下已存在的筆數。 */
  countExisting(db: DB, batchNo: string, suspenseDate: string, suspenseType: string, currency: string): number {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE batch_no = ? AND suspense_date = ? AND suspense_type = ? AND currency = ?
    `).get(batchNo, suspenseDate, suspenseType, currency) as { cnt: number }).cnt;
  },

  /** 同批號是否已被其他幣別使用（回傳該幣別，或 undefined）。 */
  findOtherCurrency(db: DB, batchNo: string, currency: string): string | undefined {
    const row = db.prepare(`
      SELECT DISTINCT currency FROM suspense_transactions WHERE batch_no = ? AND currency != ?
    `).get(batchNo, currency) as { currency: string } | undefined;
    return row?.currency;
  },

  insert(db: DB, r: InsertTransactionRow): void {
    db.prepare(`
      INSERT INTO suspense_transactions
      (transaction_no, suspense_date, suspense_type, batch_no, bank_code, account_code, currency,
       prev_company_balance, prev_passbook_balance, today_company_balance, today_passbook_balance,
       total_suspense_amount, suspense_amount, exchange_rate, suspense_amount_local, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.transaction_no, r.suspense_date, r.suspense_type, r.batch_no, r.bank_code, r.account_code, r.currency,
      r.prev_company_balance, r.prev_passbook_balance, r.today_company_balance, r.today_passbook_balance,
      r.total_suspense_amount, r.suspense_amount, r.exchange_rate, r.suspense_amount_local, r.created_by, r.updated_by,
    );
  },

  /** 更新立暫收金額（樂觀鎖：須 version 相符且未確認未日結）。回傳受影響筆數。 */
  updateAmount(db: DB, p: { id: number; suspense_amount: number; version: number; updated_by: string }): number {
    return db.prepare(`
      UPDATE suspense_transactions
      SET suspense_amount = ?,
          suspense_amount_local = ? * exchange_rate,
          total_suspense_amount = ?,
          updated_by = ?,
          updated_at = datetime('now'),
          version = version + 1
      WHERE id = ? AND version = ? AND is_confirmed = 0 AND is_day_closed = 0
    `).run(p.suspense_amount, p.suspense_amount, p.suspense_amount, p.updated_by, p.id, p.version).changes;
  },

  /** 設定整批確認狀態（confirmed=true → is_confirmed=1）。 */
  setConfirmedByBatch(db: DB, batchNo: string, operator: string, confirmed: boolean): void {
    db.prepare(`
      UPDATE suspense_transactions
      SET is_confirmed = ?, updated_by = ?, updated_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(confirmed ? 1 : 0, operator, batchNo);
  },

  deleteByBatch(db: DB, batchNo: string): number {
    return db.prepare("DELETE FROM suspense_transactions WHERE batch_no = ?").run(batchNo).changes;
  },

  countByBatch(db: DB, batchNo: string): number {
    return (db.prepare("SELECT COUNT(*) as cnt FROM suspense_transactions WHERE batch_no = ?")
      .get(batchNo) as { cnt: number }).cnt;
  },

  countConfirmedByBatch(db: DB, batchNo: string): number {
    return (db.prepare("SELECT COUNT(*) as cnt FROM suspense_transactions WHERE batch_no = ? AND is_confirmed = 1")
      .get(batchNo) as { cnt: number }).cnt;
  },

  countDayClosedByBatch(db: DB, batchNo: string): number {
    return (db.prepare("SELECT COUNT(*) as cnt FROM suspense_transactions WHERE batch_no = ? AND is_day_closed = 1")
      .get(batchNo) as { cnt: number }).cnt;
  },

  /** 該批號日常暫收(DAILY)已通報鎖定的筆數。 */
  countDailyReportLockedByBatch(db: DB, batchNo: string): number {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM suspense_transactions
      WHERE batch_no = ? AND suspense_type = 'DAILY' AND is_report_locked = 1
    `).get(batchNo) as { cnt: number }).cnt;
  },

  /** 該批號涉及的帳號短碼（去重）。 */
  distinctAccountCodesByBatch(db: DB, batchNo: string): string[] {
    const rows = db.prepare("SELECT DISTINCT account_code FROM suspense_transactions WHERE batch_no = ?")
      .all(batchNo) as Array<{ account_code: string }>;
    return rows.map(r => r.account_code);
  },

  /** 取該批號任一筆的作帳日（供權限參考日期）。 */
  findRefDateByBatch(db: DB, batchNo: string): string | undefined {
    const row = db.prepare("SELECT suspense_date FROM suspense_transactions WHERE batch_no = ? LIMIT 1")
      .get(batchNo) as { suspense_date: string } | undefined;
    return row?.suspense_date;
  },

  /** 該批號中立暫收金額非零的交易（供產傳票/通報）。 */
  findNonZeroByBatch(db: DB, batchNo: string): Row[] {
    return db.prepare("SELECT * FROM suspense_transactions WHERE batch_no = ? AND suspense_amount != 0")
      .all(batchNo) as Row[];
  },
};
