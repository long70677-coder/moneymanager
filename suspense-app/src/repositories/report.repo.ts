import type { DB } from "./_db";

export interface ReportRow {
  suspense_date: string;
  batch_no: string;
  account_code: string;
  currency: string;
  item_code: string;
  amount: number;
  created_by: string;
}

/** report_details 資料存取層（通報明細）。 */
export const reportRepo = {
  /** 新增一筆借方(D)、通報來源固定 '5' 的通報明細。 */
  insertDebit(db: DB, r: ReportRow): void {
    db.prepare(`
      INSERT INTO report_details (suspense_date, batch_no, account_code, currency, item_code, debit_credit, amount, report_source, created_by)
      VALUES (?, ?, ?, ?, ?, 'D', ?, '5', ?)
    `).run(r.suspense_date, r.batch_no, r.account_code, r.currency, r.item_code, r.amount, r.created_by);
  },

  deleteByBatch(db: DB, batchNo: string): number {
    return db.prepare("DELETE FROM report_details WHERE batch_no = ?").run(batchNo).changes;
  },
};
