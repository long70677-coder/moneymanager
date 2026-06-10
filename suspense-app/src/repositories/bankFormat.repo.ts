import type { DB } from "./_db";
import type { BankFormatProfile } from "@/domain/ingest.types";

type Raw = Record<string, unknown>;

function hydrate(row: Raw): BankFormatProfile {
  return {
    id: row.id as number,
    bank_code: row.bank_code as string,
    currency: row.currency as string,
    profile_name: (row.profile_name as string) ?? null,
    engine: row.engine as BankFormatProfile["engine"],
    encoding: (row.encoding as string) ?? "UTF-8",
    delimiter: (row.delimiter as string) ?? ",",
    has_header: (row.has_header as number) ?? 1,
    skip_rows: (row.skip_rows as number) ?? 0,
    sheet_name: (row.sheet_name as string) ?? null,
    column_map: JSON.parse((row.column_map as string) || "{}"),
    date_format: (row.date_format as string) ?? null,
    amount_format: row.amount_format ? JSON.parse(row.amount_format as string) : null,
    currency_map: row.currency_map ? JSON.parse(row.currency_map as string) : null,
    status: (row.status as string) ?? "ACTIVE",
  };
}

/** bank_format_profiles 資料存取層（銀行格式設定）。 */
export const bankFormatRepo = {
  /**
   * 依「銀行＋幣別」解析有效 profile：先精確幣別、再 ZZZ fallback；取最新版本。
   * 查無回 null。
   */
  resolve(db: DB, bankCode: string, currency: string): BankFormatProfile | null {
    const pick = (cur: string) =>
      db.prepare(`
        SELECT * FROM bank_format_profiles
        WHERE bank_code = ? AND currency = ? AND status = 'ACTIVE'
        ORDER BY version DESC LIMIT 1
      `).get(bankCode, cur) as Raw | undefined;

    const exact = pick(currency);
    if (exact) return hydrate(exact);
    if (currency !== "ZZZ") {
      const zzz = pick("ZZZ");
      if (zzz) return hydrate(zzz);
    }
    return null;
  },

  findById(db: DB, id: number): BankFormatProfile | null {
    const row = db.prepare("SELECT * FROM bank_format_profiles WHERE id = ?").get(id) as Raw | undefined;
    return row ? hydrate(row) : null;
  },

  findAll(db: DB): Raw[] {
    return db.prepare("SELECT * FROM bank_format_profiles ORDER BY bank_code, currency, version DESC").all() as Raw[];
  },
};
