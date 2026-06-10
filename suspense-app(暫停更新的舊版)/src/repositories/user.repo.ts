import type { DB } from "./_db";

type Row = Record<string, unknown>;

/** users / account_managers 資料存取層（使用者與帳號維護權限）。 */
export const userRepo = {
  /** 使用者清單（供操作者切換與基本資料維護）。 */
  findAll(db: DB): Row[] {
    return db.prepare(`
      SELECT id, user_code, user_name, role FROM users
      ORDER BY role DESC, user_code
    `).all() as Row[];
  },

  /** 指定使用者所維護的帳號（含主辦/代理與有效期間）。 */
  findManagedAccounts(db: DB, userId: number): Row[] {
    return db.prepare(`
      SELECT am.account_code, am.manager_type, am.valid_from, am.valid_to, ba.account_name
      FROM account_managers am
      LEFT JOIN bank_accounts ba ON am.account_code = ba.account_code
      WHERE am.user_id = ?
      ORDER BY am.manager_type DESC, am.account_code
    `).all(userId) as Row[];
  },
};
