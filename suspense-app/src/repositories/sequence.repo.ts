import type { DB } from "./_db";

/** sequence_counters 資料存取層（批號等流水號）。 */
export const sequenceRepo = {
  getValue(db: DB, counterKey: string): number | undefined {
    const row = db.prepare("SELECT current_value FROM sequence_counters WHERE counter_key = ?")
      .get(counterKey) as { current_value: number } | undefined;
    return row?.current_value;
  },

  /** 設定流水號目前值（不存在則新增）。 */
  setValue(db: DB, counterKey: string, value: number): void {
    db.prepare(`
      INSERT INTO sequence_counters (counter_key, current_value) VALUES (?, ?)
      ON CONFLICT(counter_key) DO UPDATE SET current_value = ?
    `).run(counterKey, value, value);
  },
};
