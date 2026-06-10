import type { DB } from "./_db";

/** passbook_balances 資料存取層（存摺餘額）。 */
export const balanceRepo = {
  /** 取已覆核的存摺餘額；查無回 undefined。 */
  findReviewedBalance(db: DB, balanceDate: string, accountCode: string, currency: string): number | undefined {
    const row = db.prepare(`
      SELECT balance FROM passbook_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ? AND is_reviewed = 1
    `).get(balanceDate, accountCode, currency) as { balance: number } | undefined;
    return row?.balance;
  },
};
