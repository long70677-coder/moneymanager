import type { DB } from "./_db";

type Row = Record<string, unknown>;

/** bank_accounts 資料存取層（銀行存款帳號基本資料）。 */
export const accountRepo = {
  /** 全部帳號（基本資料維護用）。 */
  findAll(db: DB): Row[] {
    return db.prepare(`
      SELECT id, account_code, account_long_code, bank_code, account_name, account_purpose,
             is_suspense, is_policy_account, currency_type
      FROM bank_accounts
      ORDER BY account_code
    `).all() as Row[];
  },

  /** 指定幣別的暫收帳戶（NTD 對應 currency_type=TWD，其餘對應 FOREIGN）。 */
  findSuspenseByCurrency(db: DB, currency: string): Row[] {
    return db.prepare(`
      SELECT * FROM bank_accounts WHERE is_suspense = 1
      AND (currency_type = ? OR (? = 'NTD' AND currency_type = 'TWD'))
    `).all(currency === "NTD" ? "TWD" : "FOREIGN", currency) as Row[];
  },

  /** 取單一帳號的完整帳號（供傳票摘要）。 */
  findLongCode(db: DB, accountCode: string): string | undefined {
    const row = db.prepare("SELECT account_long_code FROM bank_accounts WHERE account_code = ?")
      .get(accountCode) as { account_long_code: string } | undefined;
    return row?.account_long_code;
  },

  findByCode(db: DB, accountCode: string): Row | undefined {
    return db.prepare("SELECT * FROM bank_accounts WHERE account_code = ?").get(accountCode) as Row | undefined;
  },

  /** 依轉檔檔名找帳號（一檔一帳號；回陣列以便處理命中多筆的 fallback）。 */
  findByImportFileName(db: DB, fileName: string): Row[] {
    return db.prepare("SELECT * FROM bank_accounts WHERE import_file_name = ?").all(fileName) as Row[];
  },
};
