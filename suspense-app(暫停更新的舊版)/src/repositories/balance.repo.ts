import type { DB } from "./_db";

type Row = Record<string, unknown>;

/** passbook_balances 資料存取層（存摺餘額）。 */
export const balanceRepo = {
  /** 取已覆核的存摺餘額（同 key 多筆時取最新轉入次別）；查無回 undefined。 */
  findReviewedBalance(db: DB, balanceDate: string, accountCode: string, currency: string): number | undefined {
    const row = db.prepare(`
      SELECT balance FROM passbook_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ? AND is_reviewed = 1
      ORDER BY import_seq DESC LIMIT 1
    `).get(balanceDate, accountCode, currency) as { balance: number } | undefined;
    return row?.balance;
  },

  /** 取該 key 最新轉入次別那筆（任何 data_type）；供畫面顯示。 */
  getLatest(db: DB, balanceDate: string, accountCode: string, currency: string): Row | undefined {
    return db.prepare(`
      SELECT * FROM passbook_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ?
      ORDER BY import_seq DESC LIMIT 1
    `).get(balanceDate, accountCode, currency) as Row | undefined;
  },

  /** 人工修改餘額：設金額、data_type→MANUAL、回到未覆核。 */
  updateManualById(db: DB, id: number, p: { balance: number; updatedBy: string }): void {
    db.prepare(`
      UPDATE passbook_balances
      SET balance = ?, data_type = 'MANUAL', is_reviewed = 0,
          reviewed_by = NULL, reviewed_at = NULL,
          updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(p.balance, p.updatedBy, id);
  },

  /** 新增一筆人工餘額（次別 1）。 */
  insertManual(db: DB, p: { balanceDate: string; accountCode: string; currency: string; balance: number; createdBy: string }): void {
    db.prepare(`
      INSERT INTO passbook_balances
        (balance_date, account_code, currency, balance, data_type, import_seq, is_reviewed, created_by, updated_by)
      VALUES (?, ?, ?, ?, 'MANUAL', 1, 0, ?, ?)
    `).run(p.balanceDate, p.accountCode, p.currency, p.balance, p.createdBy, p.createdBy);
  },

  /** 全批覆核：指定日期+幣別+帳號範圍的存摺餘額設為已覆核。回傳覆核筆數。 */
  reviewBatch(db: DB, balanceDate: string, currency: string, accountCodes: string[] | null, reviewer: string): number {
    let sql = `
      UPDATE passbook_balances
      SET is_reviewed = 1, reviewed_by = ?, reviewed_at = datetime('now'),
          updated_by = ?, updated_at = datetime('now')
      WHERE balance_date = ? AND currency = ?
    `;
    const params: unknown[] = [reviewer, reviewer, balanceDate, currency];
    if (accountCodes != null) {
      if (accountCodes.length === 0) return 0;
      sql += ` AND account_code IN (${accountCodes.map(() => "?").join(",")})`;
      params.push(...accountCodes);
    }
    return db.prepare(sql).run(...params).changes;
  },

  /** 該 key 目前最大轉入次別（無資料回 0）。 */
  getMaxSeq(db: DB, balanceDate: string, accountCode: string, currency: string): number {
    const row = db.prepare(`
      SELECT MAX(import_seq) as m FROM passbook_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ?
    `).get(balanceDate, accountCode, currency) as { m: number | null };
    return row.m ?? 0;
  },

  /** 取該 key 最新轉入次別、且為檔案轉入(FILE_IMPORT)的那筆（供更正覆蓋）。 */
  getLatestFileImport(db: DB, balanceDate: string, accountCode: string, currency: string): Row | undefined {
    return db.prepare(`
      SELECT * FROM passbook_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ? AND data_type = 'FILE_IMPORT'
      ORDER BY import_seq DESC LIMIT 1
    `).get(balanceDate, accountCode, currency) as Row | undefined;
  },

  /** 覆蓋既有檔案轉入餘額（更正）：重設金額、檔名、回到未覆核。 */
  overwriteById(db: DB, id: number, p: { balance: number; fileName: string; updatedBy: string }): void {
    db.prepare(`
      UPDATE passbook_balances
      SET balance = ?, file_name = ?, data_type = 'FILE_IMPORT', is_reviewed = 0,
          reviewed_by = NULL, reviewed_at = NULL,
          updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(p.balance, p.fileName, p.updatedBy, id);
  },

  /** 新增一筆檔案轉入餘額（指定轉入次別）。 */
  insertFileImport(db: DB, p: {
    balanceDate: string; accountCode: string; currency: string; balance: number;
    importSeq: number; fileName: string; createdBy: string;
  }): void {
    db.prepare(`
      INSERT INTO passbook_balances
        (balance_date, account_code, currency, balance, data_type, import_seq, file_name,
         is_reviewed, created_by, updated_by)
      VALUES (?, ?, ?, ?, 'FILE_IMPORT', ?, ?, 0, ?, ?)
    `).run(p.balanceDate, p.accountCode, p.currency, p.balance, p.importSeq, p.fileName, p.createdBy, p.createdBy);
  },
};
