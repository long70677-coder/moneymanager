import type { DB } from "./_db";

/** ledger_balances 資料存取層（帳列餘額，唯讀消費；由結帳流程供應）。 */
export const ledgerBalanceRepo = {
  /** 取某日某帳號某幣別的帳列結餘；查無回 undefined。 */
  findBalance(db: DB, balanceDate: string, accountCode: string, currency: string): number | undefined {
    const row = db.prepare(`
      SELECT balance FROM ledger_balances
      WHERE balance_date = ? AND account_code = ? AND currency = ?
    `).get(balanceDate, accountCode, currency) as { balance: number } | undefined;
    return row?.balance;
  },
};
