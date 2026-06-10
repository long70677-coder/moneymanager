import type { DB } from "@/repositories/_db";
import { getAccessibleAccountCodes } from "@/lib/db";
import { accountRepo } from "@/repositories/account.repo";
import { bankFormatRepo } from "@/repositories/bankFormat.repo";
import { balanceRepo } from "@/repositories/balance.repo";
import { suspenseRepo } from "@/repositories/suspense.repo";
import { getParser } from "./parsers/registry";
import { applyMapping } from "./mapping";
import type { ImportResult, RowError } from "@/domain/ingest.types";

export interface IngestInput {
  fileName: string;
  content: Buffer;
  screenBalanceDate: string; // 畫面餘額日期（檢核檔內日期須一致）
  userId: number;
  secondImport: boolean; // ☑ 二次轉入
  operator: string;
}

function nextBusinessDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

export interface PreviewResult {
  fileName: string;
  accountCode: string | null;
  profileId: number | null;
  records: import("@/domain/ingest.types").NormalizedBalanceRecord[];
  errors: RowError[];
  error?: string;
}

/** 試轉預覽（dry-run）：路由→profile→解析→對應，只回結果不寫入。 */
export function previewFile(db: DB, fileName: string, content: Buffer): PreviewResult {
  const base: PreviewResult = { fileName, accountCode: null, profileId: null, records: [], errors: [] };
  const matched = accountRepo.findByImportFileName(db, fileName);
  if (matched.length === 0) return { ...base, error: "檔名比對不到帳號" };
  if (matched.length > 1) return { ...base, error: "檔名命中多個帳號" };
  const account = matched[0];
  const accountCurrency = (account.currency_type as string) === "TWD" ? "NTD" : "ZZZ";
  const profile = bankFormatRepo.resolve(db, account.bank_code as string, accountCurrency);
  if (!profile) return { ...base, accountCode: account.account_code as string, error: `查無格式設定（銀行 ${account.bank_code}）` };
  try {
    const rows = getParser(profile.engine)(content, profile);
    const mapped = applyMapping(rows, profile, { currency: accountCurrency === "NTD" ? "NTD" : undefined });
    return { fileName, accountCode: account.account_code as string, profileId: profile.id, records: mapped.records, errors: mapped.errors };
  } catch (e) {
    return { ...base, accountCode: account.account_code as string, profileId: profile.id, error: e instanceof Error ? e.message : "解析失敗" };
  }
}

/** 轉入單一檔案（一檔一帳號）。回傳該檔的轉檔結果；逐檔獨立，不丟例外讓整批中斷。 */
export function ingestFile(db: DB, input: IngestInput): ImportResult {
  const fail = (msg: string, extra?: Partial<ImportResult>): ImportResult => ({
    fileName: input.fileName, accountCode: null, profileId: null, balanceDate: input.screenBalanceDate,
    total: 0, success: 0, fail: 1, status: "FAILED", errors: [{ sourceRow: 0, message: msg }], ...extra,
  });

  // 1. 路由：檔名 → 單一帳號
  const matched = accountRepo.findByImportFileName(db, input.fileName);
  if (matched.length === 0) return fail("檔名比對不到帳號，請於帳號基本資料設定 import_file_name 或手動指定");
  if (matched.length > 1) return fail("檔名命中多個帳號，請手動指定");
  const account = matched[0];
  const accountCode = account.account_code as string;
  const bankCode = account.bank_code as string;
  const accountCurrency = (account.currency_type as string) === "TWD" ? "NTD" : "ZZZ";

  // 2. 權限：帳號須在操作者可維護範圍
  const accessible = getAccessibleAccountCodes(db, input.userId, input.screenBalanceDate);
  if (accessible !== null && !accessible.includes(accountCode)) {
    return fail("您沒有此帳號的維護權限", { accountCode });
  }

  // 3. 解析 profile（銀行＋幣別，ZZZ fallback）
  const profile = bankFormatRepo.resolve(db, bankCode, accountCurrency);
  if (!profile) return fail(`查無格式設定（銀行 ${bankCode}）`, { accountCode });

  // 4. Parse + Map
  let records, mapErrors: RowError[];
  try {
    const rows = getParser(profile.engine)(input.content, profile);
    const mapped = applyMapping(rows, profile, { currency: accountCurrency === "NTD" ? "NTD" : undefined });
    records = mapped.records;
    mapErrors = mapped.errors;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "解析失敗", { accountCode, profileId: profile.id });
  }

  const errors: RowError[] = [...mapErrors];
  let success = 0;

  // 候選暫收日期（供「已立暫收則擋覆蓋」檢核）：當日(二次) + 次營業日(日常)
  const suspenseDates = [input.screenBalanceDate, nextBusinessDay(input.screenBalanceDate)];

  const writeAll = db.transaction(() => {
    for (const r of records) {
      // 檢核：檔內日期須與畫面一致
      if (r.balanceDate !== input.screenBalanceDate) {
        errors.push({ sourceRow: r.sourceRow, field: "餘額日期", message: `檔內日期 ${r.balanceDate} 與畫面餘額日期 ${input.screenBalanceDate} 不一致` });
        continue;
      }
      // 檢核：檔內帳號（若有）須與路由帳號一致
      if (r.accountCode && r.accountCode !== accountCode) {
        errors.push({ sourceRow: r.sourceRow, field: "帳號", message: `檔內帳號 ${r.accountCode} 與檔名對應帳號 ${accountCode} 不一致` });
        continue;
      }
      const currency = r.currency;
      const maxSeq = balanceRepo.getMaxSeq(db, r.balanceDate, accountCode, currency);

      if (input.secondImport) {
        // 二次轉入：保留前筆，次別 +1
        balanceRepo.insertFileImport(db, {
          balanceDate: r.balanceDate, accountCode, currency, balance: r.balance,
          importSeq: maxSeq + 1, fileName: input.fileName, createdBy: input.operator,
        });
        success++;
      } else if (maxSeq === 0) {
        // 首次轉入
        balanceRepo.insertFileImport(db, {
          balanceDate: r.balanceDate, accountCode, currency, balance: r.balance,
          importSeq: 1, fileName: input.fileName, createdBy: input.operator,
        });
        success++;
      } else {
        // 更正覆蓋：先檢核是否已立暫收
        if (suspenseRepo.existsByAccountCurrencyDates(db, accountCode, currency, suspenseDates)) {
          errors.push({ sourceRow: r.sourceRow, field: "立暫收", message: "該帳號餘額已被立暫收，須先取消立暫收才能重轉" });
          continue;
        }
        const latest = balanceRepo.getLatestFileImport(db, r.balanceDate, accountCode, currency);
        if (latest) {
          balanceRepo.overwriteById(db, latest.id as number, { balance: r.balance, fileName: input.fileName, updatedBy: input.operator });
        } else {
          // 既有為手動/前日（非 FILE_IMPORT）：不覆蓋，另開新次別
          balanceRepo.insertFileImport(db, {
            balanceDate: r.balanceDate, accountCode, currency, balance: r.balance,
            importSeq: maxSeq + 1, fileName: input.fileName, createdBy: input.operator,
          });
        }
        success++;
      }
    }
  });
  writeAll();

  const total = success + errors.length;
  const status: ImportResult["status"] = success === 0 ? "FAILED" : errors.length > 0 ? "PARTIAL" : "SUCCESS";

  return {
    fileName: input.fileName, accountCode, profileId: profile.id, balanceDate: input.screenBalanceDate,
    total, success, fail: errors.length, status, errors,
  };
}
