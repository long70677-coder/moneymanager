import type { DB } from "./_db";

/** batch_confirmations 資料存取層（批號確認狀態）。 */
export const batchRepo = {
  findByBatchNo(db: DB, batchNo: string): Record<string, unknown> | null {
    return (db.prepare("SELECT * FROM batch_confirmations WHERE batch_no = ? LIMIT 1")
      .get(batchNo) as Record<string, unknown> | undefined) ?? null;
  },

  insertIgnore(db: DB, p: { suspenseDate: string; currency: string; batchType: string; batchNo: string }): void {
    db.prepare(`
      INSERT OR IGNORE INTO batch_confirmations (suspense_date, currency, batch_type, batch_no, confirm_status)
      VALUES (?, ?, ?, ?, 'UNCONFIRMED')
    `).run(p.suspenseDate, p.currency, p.batchType, p.batchNo);
  },

  markConfirmed(db: DB, batchNo: string, operator: string): void {
    db.prepare(`
      UPDATE batch_confirmations
      SET confirm_status = 'CONFIRMED', confirmed_by = ?, confirmed_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator, batchNo);
  },

  markCancelled(db: DB, batchNo: string, operator: string): void {
    db.prepare(`
      UPDATE batch_confirmations
      SET confirm_status = 'UNCONFIRMED', cancelled_by = ?, cancelled_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator, batchNo);
  },

  deleteByBatch(db: DB, batchNo: string): number {
    return db.prepare("DELETE FROM batch_confirmations WHERE batch_no = ?").run(batchNo).changes;
  },
};
