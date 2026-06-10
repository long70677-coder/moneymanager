import type { DB } from "./_db";
import type { ImportResult } from "@/domain/ingest.types";

/** import_logs 資料存取層（轉檔歷程）。 */
export const importLogRepo = {
  insert(db: DB, batchId: string, r: ImportResult, uploadedBy: string): void {
    db.prepare(`
      INSERT INTO import_logs
        (batch_id, file_name, account_code, profile_id, balance_date,
         total_count, success_count, fail_count, status, errors, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId, r.fileName, r.accountCode, r.profileId, r.balanceDate,
      r.total, r.success, r.fail, r.status,
      r.errors.length ? JSON.stringify(r.errors) : null, uploadedBy,
    );
  },

  findByBatch(db: DB, batchId: string): Record<string, unknown>[] {
    return db.prepare("SELECT * FROM import_logs WHERE batch_id = ? ORDER BY id").all(batchId) as Record<string, unknown>[];
  },
};
