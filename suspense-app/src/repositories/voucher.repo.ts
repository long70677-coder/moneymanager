import type { DB } from "./_db";

export interface VoucherRow {
  voucher_no: string;
  suspense_date: string;
  batch_no: string;
  batch_type: string;
  account_code: string;
  currency: string;
  debit_credit: string;
  accounting_code: string;
  amount: number;
  amount_local: number;
  summary: string;
  created_by: string;
}

/** voucher_entries 資料存取層（傳票）。 */
export const voucherRepo = {
  insert(db: DB, r: VoucherRow): void {
    db.prepare(`
      INSERT INTO voucher_entries (voucher_no, suspense_date, batch_no, batch_type, account_code, currency, debit_credit, accounting_code, amount, amount_local, summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.voucher_no, r.suspense_date, r.batch_no, r.batch_type, r.account_code, r.currency,
      r.debit_credit, r.accounting_code, r.amount, r.amount_local, r.summary, r.created_by,
    );
  },

  deleteByBatch(db: DB, batchNo: string): number {
    return db.prepare("DELETE FROM voucher_entries WHERE batch_no = ?").run(batchNo).changes;
  },
};
