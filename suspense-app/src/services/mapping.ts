import type {
  BankFormatProfile, ColumnRef, NormalizedBalanceRecord, RawRow, RowError,
} from "@/domain/ingest.types";

function readCell(cells: Record<string, string>, ref?: ColumnRef): string | undefined {
  if (!ref) return undefined;
  return cells[String(ref.key)];
}

/** 解析日期 → ISO yyyy-mm-dd。支援西元 YYYY-MM-DD / YYYY/MM/DD 與民國 YYY/MM/DD。 */
export function parseDate(raw: string, format?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  const m = v.match(/^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  let year = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  // 民國年判斷：格式明示三位年(YYY 而非 YYYY)、或無格式且年份為 2-3 位、或年份 < 1911
  const fmtRoc = format ? /Y{3}/.test(format) && !/Y{4}/.test(format) : false;
  const isRoc = fmtRoc || (!format && m[1].length <= 3) || year < 1911;
  if (isRoc) year += 1911;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const mm = String(mon).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** 解析金額 → number。去千分位、全形數字、括號負號。 */
export function parseAmount(raw: string, fmt?: BankFormatProfile["amount_format"]): number | null {
  if (raw == null) return null;
  let v = raw.trim();
  if (v === "") return null;
  // 全形數字/符號 → 半形
  v = v.replace(/[０-９．，（）－]/g, c => "0123456789.,()-"["０１２３４５６７８９．，（）－".indexOf(c)]);
  let negative = false;
  if (fmt?.parenthesesNegative !== false && /^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.startsWith("-")) { negative = true; v = v.slice(1); }
  v = v.replace(/,/g, ""); // 去千分位
  if (!/^\d*\.?\d+$/.test(v)) return null;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/**
 * 依 profile 將原始列對應為標準餘額記錄。
 * defaults.currency：當檔案無幣別欄時採用（例：台幣帳號 NTD）。
 */
export function applyMapping(
  rows: RawRow[],
  profile: BankFormatProfile,
  defaults: { currency?: string },
): { records: NormalizedBalanceRecord[]; errors: RowError[] } {
  const cm = profile.column_map;
  const records: NormalizedBalanceRecord[] = [];
  const errors: RowError[] = [];

  for (const row of rows) {
    const rawDate = readCell(row.cells, cm.balanceDate);
    const rawBalance = readCell(row.cells, cm.balance);
    const rawCurrency = cm.currency ? readCell(row.cells, cm.currency) : undefined;
    const rawAccount = cm.accountCode ? readCell(row.cells, cm.accountCode) : undefined;

    const balanceDate = parseDate(rawDate || "", profile.date_format);
    if (!balanceDate) { errors.push({ sourceRow: row.sourceRow, field: "餘額日期", message: `日期無法解析：${rawDate ?? ""}` }); continue; }

    const balance = parseAmount(rawBalance || "", profile.amount_format);
    if (balance == null) { errors.push({ sourceRow: row.sourceRow, field: "餘額", message: `金額無法解析：${rawBalance ?? ""}` }); continue; }

    let currency = (rawCurrency || defaults.currency || "").trim();
    if (profile.currency_map && currency && profile.currency_map[currency]) currency = profile.currency_map[currency];
    if (!currency) { errors.push({ sourceRow: row.sourceRow, field: "幣別", message: "幣別未提供" }); continue; }

    records.push({
      balanceDate,
      accountCode: (rawAccount || "").trim(), // 可能為空；由 service 以路由帳號補/驗證
      currency,
      balance,
      sourceRow: row.sourceRow,
    });
  }

  return { records, errors };
}
