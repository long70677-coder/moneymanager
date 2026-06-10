// FUN2.1.1 存摺餘額轉檔 — 領域型別（不 import 其他層）

export type ParserEngine = "DELIMITED" | "FIXED_WIDTH" | "EXCEL";

/** 銀行格式設定（bank_format_profiles 一筆，column_map 等 JSON 欄位已解析） */
export interface BankFormatProfile {
  id: number;
  bank_code: string;
  currency: string; // 特定幣別或 ZZZ
  profile_name: string | null;
  engine: ParserEngine;
  encoding: string;
  delimiter: string;
  has_header: number;
  skip_rows: number;
  sheet_name: string | null;
  column_map: ColumnMap;
  date_format: string | null;
  amount_format: AmountFormat | null;
  currency_map: Record<string, string> | null;
  status: string;
}

export type ColumnRef = { by: "name" | "index"; key: string | number };
export interface ColumnMap {
  balanceDate: ColumnRef;
  accountCode: ColumnRef;
  currency?: ColumnRef;
  balance: ColumnRef;
}
export interface AmountFormat {
  thousandsSeparator?: boolean; // 去千分位
  parenthesesNegative?: boolean; // (1,000) = -1000
}

/** 解析後的原始列（字串） */
export interface RawRow {
  sourceRow: number;
  cells: Record<string, string>; // 欄名或欄序(字串)→值
}

/** Map 後的標準餘額記錄（記憶體中繼，不落地） */
export interface NormalizedBalanceRecord {
  balanceDate: string; // ISO yyyy-mm-dd
  accountCode: string;
  currency: string;
  balance: number;
  sourceRow: number;
}

/** 逐列錯誤 */
export interface RowError {
  sourceRow: number;
  field?: string;
  message: string;
}

/** 單一檔案的轉檔結果 */
export interface ImportResult {
  fileName: string;
  accountCode: string | null;
  profileId: number | null;
  balanceDate: string | null;
  total: number;
  success: number;
  fail: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  errors: RowError[];
}
