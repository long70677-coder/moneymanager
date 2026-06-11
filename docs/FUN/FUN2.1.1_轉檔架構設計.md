# FUN2.1.1 存摺餘額轉檔 — 架構設計

> 本文件定義「存摺餘額轉檔」的技術架構：如何讓**多家銀行、不同格式**的餘額檔，吃進**同一個目標表** `passbook_balances`，且**新增銀行／調整格式時盡量只改設定、不改程式**。
> 規格依據：`SA_TO_SD`（URS/SA）、`SD_DB_DESIGN.md`（資料表）、`suspense-app/ARCHITECTURE.md`（分層）。
> 狀態：**設計定稿（7 項議題已決議，見 §13），尚未實作。**

---

## 1. 目的與範圍

- 提供資金管理課經辦匯入銀行帳戶存摺餘額，寫入 `passbook_balances`，供後續日常／二次暫收比對。
- 來源銀行格式不固定、且會變動 → 架構必須**可擴充**且**設定驅動**。
- 範圍：檔案上傳 → 解析 → 對應 → 檢核 → 寫入 → 轉檔歷程；含銀行格式設定維護與試轉預覽；含餘額查詢／人工調整／覆核。
- 不在本範圍：結帳／日結流程（產生帳列餘額，另一模組）、暫收交易 FUN2.1.2（已實作）。

---

## 2. 設計原則（不可違反）

1. **三段式正規化**：Parse → Map → Validate+Write，中間以 canonical 標準格式銜接。
2. **canonical 只在記憶體、不落地成檔**：所謂「標準格式」是程式記憶體中的資料形狀（= 目標欄位），**不會產生任何中間 CSV**。銀行原始檔讀進來解析後直接寫入 DB。
3. **單一寫入路徑**：所有銀行最終走同一段「檢核＋寫入」，與銀行無關 → 保證「多格式吃進同一表」。
4. **不寫死格式**：欄位對應、日期/金額/編碼/幣別對照一律放**設定**（`bank_format_profiles`），不寫進程式。
5. **引擎參數化**：解析引擎只有少數通用型（分隔／固定寬／Excel），行為由設定參數驅動。
6. **EXE 降級為一種 parser**：既有外部轉檔 EXE 不是架構前提，視為 `StandardCsvParser` 這一條 adapter，可與原生 parser 並存、逐家汰換。
7. **分層**：遵循 `ARCHITECTURE.md`，route → service → repository → db。

---

## 3. 整體流程

```
多個銀行原始檔（一檔一帳號，格式各異）
      │  多檔上傳
      ▼
┌─ 路由 ──────────┐  以「檔名」比對 bank_accounts.import_file_name → 找到該檔對應的「單一帳號」
│ 檔名→帳號→profile│  → 由帳號的「銀行＋幣別」帶出 profile（精確幣別→ZZZ fallback）
└─────────────────┘
      ▼
┌─ Parse ─────────┐  依 profile 選通用引擎，處理編碼/分隔/固定寬/Excel/略過表頭 → RawRow[]
└─────────────────┘
      ▼
┌─ Map ───────────┐  依 profile 設定：欄位對應、民國年/日期格式、金額格式、幣別對照
└─────────────────┘  → NormalizedBalanceRecord（記憶體中繼，不落地）
      ▼
┌─ Validate+Write ┐  ★共用、與銀行無關★ 檢核(§6) → 寫入 passbook_balances(§7) → 寫 import_logs
└─────────────────┘  逐檔獨立：成功照轉、失敗回報（部分成功）
      ▼
  passbook_balances（目標表，含轉入次別 import_seq） + import_logs（歷程）
```

---

## 4. Canonical 標準格式（記憶體中繼，不落地）

每個 parser／mapping 不論原檔多怪，最終都吐出這個結構。**這是整個功能的接點，不是檔案。**

```ts
interface NormalizedBalanceRecord {
  balanceDate: string;   // 已轉 ISO yyyy-mm-dd
  accountCode: string;   // 該檔對應的帳號短碼
  currency: string;      // 已對應本系統幣別碼
  balance: number;       // 已轉數字（去千分位/全形/括號負號）
  sourceRow: number;     // 原檔行號，供錯誤回報
}
interface RowError { sourceRow: number; field?: string; message: string; }
```

> 目標欄位即 `passbook_balances` 的關鍵欄（餘額日期／帳號／幣別／餘額），已定義，不需另立檔案規格。

---

## 5. 三段詳細設計

### 5.1 路由（檔名 → 帳號 → profile）

- **一檔一帳號**：每個上傳檔只含「單一帳號」的餘額。
- `bank_accounts.import_file_name` 設定該帳號的檔名；上傳時以檔名比對找到帳號。
- 由帳號的「銀行代碼＋幣別」帶出 profile（§8.1 解析順序：精確幣別命中 → `ZZZ` fallback）。
- **比對不到 / 命中多帳號** → 該檔退回**手動指定帳號/ profile**（不自動猜）。
- **副檔名不參與判斷**（`.txt`/`.csv`/`.dat` 皆可，由 profile 的引擎/分隔決定怎麼切）。

### 5.2 Parse（解析引擎，可插拔）

```ts
interface BankBalanceParser {
  engine: "DELIMITED" | "FIXED_WIDTH" | "EXCEL";
  parse(file: Buffer, profile: BankFormatProfile): RawRow[];
}
```
| 引擎 | 適用 | 主要設定參數 |
|------|------|--------------|
| `DELIMITED` | CSV / TXT 分隔 | encoding、delimiter、skip_rows、has_header |
| `FIXED_WIDTH` | 固定寬度 | encoding、skip_rows、欄位起訖位置 |
| `EXCEL` | xls / xlsx | sheet_name、skip_rows、has_header |
- **Registry**：以 `engine` 註冊查找；出現全新結構類型（XML/JSON…）才新增引擎（一次性），之後同類型吃設定。
- **EXE 整合**：舊 EXE 產出的標準 CSV → 用 `DELIMITED` 設定一筆 profile 即可，無需特寫 parser。

### 5.3 Map（欄位對應，設定驅動）

依 `bank_format_profiles`（§8.1）做對應，全部不寫程式：欄位對應（欄名或欄序）、日期格式（含民國年 `YYY/MM/DD`）→ISO、金額格式（千分位/括號負/全形）→number、幣別對照（`01→NTD`）。

### 5.4 Validate + Write（共用）

檢核見 §6；寫入與覆蓋見 §7；歷程見 §8.3。多列寫入包在 service 的 `db.transaction()`。**逐檔獨立、部分成功**（議題 6）。

---

## 6. 轉檔檢核規則（SA L97–113 + 議題決議）

寫入前須通過：
1. 必填欄位（餘額日期／帳號／幣別／餘額）未填 → 不可轉檔。
2. **檔案內餘額日期須與畫面餘額日期一致**。
3. 帳號須存在於 `bank_accounts` 且為**暫收帳戶**（`is_suspense=1`），且在**操作者可維護範圍**內。
4. **同批多檔：檔名不可重複**（一檔一帳號，檔名重複代表同帳號被選兩次）→ 重複即擋整批（議題 3）。
5. **T-1 餘額轉入**：檢查該幣別當日是否已有**日常暫收批號**（依規則）。
6. **T 日餘額轉入**：檢查該帳號+幣別是否已有**二次暫收批號**。
7. 該作帳日該幣別類型**已日結** → 不可轉入 T-1 餘額。
8. **重傳覆蓋前置檢核**：若覆蓋對象已被立暫收 → **擋下，須先取消立暫收**（議題 3）。

---

## 7. 寫入、覆蓋與「轉入次別」規則（議題 3 決議）

- 目標表 `passbook_balances`，**唯一鍵 = 餘額日期＋帳號＋幣別＋`import_seq`（轉入次別）**。
- `data_type`：`FILE_IMPORT`（檔案轉入）/ `PREV_DAY`（前日）/ `MANUAL`（手動）。

| 動作 | 行為 |
|------|------|
| 一般轉入 | 寫入 `import_seq = 1` |
| 重傳更正（畫面未勾「二次轉入」） | **覆蓋目前最新次別**那筆；若該餘額已被立暫收 → 擋下，須先取消立暫收 |
| ☑ 二次轉入（勾選） | `import_seq = 前次最大 + 1`，**保留前一筆**，兩筆並存 |
| 同批多檔 | 檔名不可重複（§6.4） |

其他既有規則：
- 重複轉檔**僅覆蓋 `data_type='FILE_IMPORT'`** 的資料；手動/前日不覆蓋。
- 全幣別轉檔但部分幣別已立暫收 → 僅轉入尚未立暫收部分。
- 轉入資料 `is_reviewed=0`，須覆核後才能立暫收。

**下游（FUN2.1.2 立暫收）取值規則**：新的立暫收一律取**最新次別**（`import_seq` 最大）的餘額；已立暫收的舊次別資料保留不動（稽核軌跡）。

---

## 8. 資料表設計

### 8.1 `bank_format_profiles`（銀行格式設定檔 — 新增）

> 設定驅動核心。新增銀行／調整格式 = 改此表，不動程式。**鍵 = 銀行＋幣別**。

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | INTEGER | PK | |
| bank_code | TEXT | NOT NULL | 銀行代碼 |
| currency | TEXT | NOT NULL | 幣別；可為特定碼(NTD/USD…)或 **`ZZZ`=該行共用/外幣格式** |
| profile_name | TEXT | | 設定名稱 |
| engine | TEXT | NOT NULL | `DELIMITED` / `FIXED_WIDTH` / `EXCEL` |
| encoding | TEXT | DEFAULT 'UTF-8' | `UTF-8` / `BIG5` |
| delimiter | TEXT | | 分隔符 |
| has_header | INTEGER | DEFAULT 1 | 是否有表頭 |
| skip_rows | INTEGER | DEFAULT 0 | 略過前 N 行 |
| sheet_name | TEXT | | Excel 工作表 |
| column_map | TEXT(JSON) | NOT NULL | 欄位對應（欄名或欄序） |
| date_format | TEXT | | 來源日期格式（含民國年） |
| amount_format | TEXT(JSON) | | 金額格式選項 |
| currency_map | TEXT(JSON) | | 幣別對照 |
| version | INTEGER | DEFAULT 1 | 版本 |
| effective_date | TEXT | | 生效日（排程切換） |
| status | TEXT | DEFAULT 'DRAFT' | `DRAFT`/`ACTIVE`/`RETIRED` |
| is_reviewed / reviewed_by / reviewed_at | | | 設定覆核軌跡 |
| created_by/at、updated_by/at | TEXT | | 軌跡 |
| — | — | **UNIQUE(bank_code, currency, version)** | |

**profile 解析順序**：以帳號的(銀行, 幣別)查 → 先 `(bank, 該幣別)` 精確命中 → 無則 `(bank, ZZZ)`。

DDL（SQLite，比照 `db.ts`）：
```sql
CREATE TABLE IF NOT EXISTS bank_format_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  profile_name TEXT,
  engine TEXT NOT NULL,
  encoding TEXT DEFAULT 'UTF-8',
  delimiter TEXT,
  has_header INTEGER DEFAULT 1,
  skip_rows INTEGER DEFAULT 0,
  sheet_name TEXT,
  column_map TEXT NOT NULL,
  date_format TEXT,
  amount_format TEXT,
  currency_map TEXT,
  version INTEGER DEFAULT 1,
  effective_date TEXT,
  status TEXT DEFAULT 'DRAFT',
  is_reviewed INTEGER DEFAULT 0, reviewed_by TEXT, reviewed_at TEXT,
  created_by TEXT DEFAULT 'System', created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT 'System', updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(bank_code, currency, version)
);
```

### 8.2 `bank_accounts` 擴充（既有表加欄位）

| 新增欄位 | 型別 | 說明 |
|---------|------|------|
| `import_file_name` | TEXT | 該帳號餘額檔的**檔名**（一檔一帳號） |

> profile **不另存欄位**，由系統依「`bank_code` ＋ 帳號幣別」即時帶出（§8.1 解析順序），**唯讀、不可手改**。

### 8.3 `import_logs`（轉檔歷程 — 新增；SA L259–267）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | |
| batch_id | TEXT | 上傳批次號 |
| file_name | TEXT | 來源檔名 |
| account_code | TEXT | 對應帳號 |
| profile_id | INTEGER | 使用的格式設定 |
| balance_date | TEXT | 餘額日期 |
| total_count / success_count / fail_count | INTEGER | 筆數統計 |
| status | TEXT | `SUCCESS`/`PARTIAL`/`FAILED` |
| errors | TEXT(JSON) | 逐列錯誤 |
| uploaded_by / uploaded_at | TEXT | 上傳軌跡 |

### 8.4 `ledger_balances`（帳列餘額檔 — 新增；議題 5）

> 公司內部「帳列餘額」，由**結帳／日結流程**寫入（「當日結完出現本日結餘」）。FUN2.1.1 與 FUN2.1.2 皆為**唯讀消費者**；結帳流程本身另屬範圍。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | |
| balance_date | TEXT NOT NULL | 帳列/結餘日期 |
| account_code | TEXT NOT NULL, FK→bank_accounts | 帳號短碼 |
| currency | TEXT NOT NULL | 幣別 |
| balance | REAL DEFAULT 0 | 帳列結餘（本日結餘） |
| is_closed | INTEGER DEFAULT 0 | 是否已日結 |
| closed_at | TEXT | 結帳時間 |
| created_by/at、updated_by/at | TEXT | 軌跡 |
| — | — | **UNIQUE(balance_date, account_code, currency)** |

```sql
CREATE TABLE IF NOT EXISTS ledger_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  balance_date TEXT NOT NULL,
  account_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance REAL DEFAULT 0,
  is_closed INTEGER DEFAULT 0,
  closed_at TEXT,
  created_by TEXT DEFAULT 'System', created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT 'System', updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(balance_date, account_code, currency),
  FOREIGN KEY (account_code) REFERENCES bank_accounts(account_code)
);
```

### 8.5 `passbook_balances`（既有，調整；議題 3）

新增 `import_seq INTEGER DEFAULT 1`（轉入次別）；唯一鍵改為 **UNIQUE(balance_date, account_code, currency, import_seq)**。其餘欄位見 `SD_DB_DESIGN.md` §2。

---

## 9. 餘額轉檔／維護畫面（議題 4、5、7）

定位：資金管理 → 存摺餘額轉檔。**台幣／外幣同一畫面、同一功能，差異以參數控制**（議題 7）。

**版面：以帳號為基礎，列出操作者可維護的暫收帳號；兩種前日餘額並陳。**

```
條件區： 餘額日期[T-1▼]  幣別[NTD▼]   [選擇檔案(可多選)] [轉檔]  ☐ 二次轉入
────────────────────────────────────────────────────────────────────────
帳號     用途       幣別  系統前日帳列餘額  ☐ 銀行存摺轉入前日餘額   立暫收差額  資料來源
ACT-001  台幣暫收A  NTD   1,250,000(唯讀)   ☐ [1,250,000](可改)      0          檔案轉入
ACT-002  台幣暫收B  NTD   3,500,000(唯讀)   ☐ [        0](可改)     -3,500,000  前日餘額
────────────────────────────────────────────────────────────────────────
[全批覆核]   [儲存]                              覆核：經辦自核，記錄人員/時間
```

- **系統前日帳列餘額**（唯讀）：取 `ledger_balances` 前一營業日結餘，僅顯示不可異動。
- **銀行存摺轉入前日餘額**（可改）：取 `passbook_balances` 前一營業日；**勾選該列才可編輯**，儲存 `UPDATE passbook_balances`，人工改過 → `data_type=MANUAL`。
- 即使尚未轉檔，暫收帳戶仍顯示，並帶出前日存摺餘額（SA）。
- **覆核**：全批覆核（以餘額日期＋幣別為單位），記錄覆核人員＋時間；**經辦轉檔、經辦自核**（不設覆核者≠轉檔者限制）（議題 4）。
- 「前一日」= 前一**營業日**（非自然日），與 `getPrevBusinessDay` 一致。

**銀行格式設定維護頁**（系統設定）：§8.1 欄位的 CRUD + **試轉預覽（dry-run）**——上傳樣本檔只解析不寫入，回傳前 N 列解析結果與錯誤，供經辦自驗格式，銀行改格式不需找工程師。

---

## 10. 設定可改 vs 需加引擎（界線）

| 變動 | 只改設定？ |
|------|:---:|
| 新增銀行（分隔／固定寬／Excel 之一） | ✅ |
| 既有銀行調整：欄序、欄名、增減欄、日期/金額格式、編碼、表頭行數 | ✅ |
| 幣別／帳號代碼對照調整 | ✅ |
| 全新檔案結構類型（XML/JSON/PDF/壓縮…） | ⚠️ 一次性新增引擎 |
| 客製運算（多欄相加、跨列計算） | ⚠️ 需寫轉換邏輯（未來增強，第一版不做） |

預估日常變動約 8–9 成可純設定完成。

---

## 11. EXE 漸進汰換策略

1. 既有 EXE 不立即廢除：其標準 CSV 建一筆 `DELIMITED` profile 照常吃。
2. 新銀行直接寫原生設定，不經 EXE。
3. 既有銀行逐家改原生解析，試轉預覽通過後切換。
4. 全數遷移後再評估退役。**全程兩條路並存，無 big-bang。**

---

## 12. 對應現有分層架構（`ARCHITECTURE.md`）

```
app/api/
  balance-import/route.ts        # 收檔上傳→ingest.service
  bank-formats/route.ts          # 格式設定 CRUD + 試轉預覽
  balances/route.ts              # 餘額查詢/人工維護/全批覆核
services/
  ingest.service.ts              # 路由→parse→map→validate→write→log
  parsers/                       # 通用引擎 + registry
  mapping.ts                     # 依 profile 做 Map
repositories/
  balance.repo.ts                # passbook_balances（擴充 upsert + import_seq）
  ledgerBalance.repo.ts          # ledger_balances（新，唯讀）
  bankFormat.repo.ts             # bank_format_profiles（新）
  importLog.repo.ts              # import_logs（新）
domain/
  ingest.types.ts                # NormalizedBalanceRecord / RowError / ParserEngine
```

引擎 registry 是唯一「加程式」的擴充點；其餘變化吃設定。

---

## 13. 議題決議記錄（2026-06-10 定案）

| # | 議題 | 決議 |
|---|------|------|
| 1 | 解析放哪裡 | **內建設定驅動 parser**；EXE 降級為 `StandardCsvParser`，漸進汰換 |
| 2 | 如何辨識銀行/格式 | **一檔一帳號**；`bank_accounts.import_file_name` 以檔名對到帳號；profile 鍵=**銀行＋幣別**，幣別可用 **ZZZ** 共用；profile 由帳號(銀行+幣別)唯讀帶出（精確→ZZZ）；**無中間 CSV** |
| 3 | 重複資料 | 同批**檔名不可重複**；重傳更正**覆蓋最新次別**（已立暫收須先取消）；勾**二次轉入**則 `import_seq+1` 保留前筆；下游立暫收取**最新次別** |
| 4 | 覆核 | **全批覆核**（餘額日期＋幣別）＋記錄人員/時間；**經辦轉檔經辦自核**（不設覆核者≠轉檔者） |
| 5 | 前日餘額來源 | 畫面**兩種並陳**：系統前日帳列餘額（唯讀，新增 `ledger_balances`，來自結帳流程）＋銀行存摺轉入前日餘額（可改，`passbook_balances`，勾選可改、存檔更新、人工改→MANUAL） |
| 6 | 部分成功 | **逐檔處理**，成功照轉、失敗回報（`import_logs`） |
| 7 | 台幣/外幣 | **同一功能、不同參數規則**；處理時點做成幣別別參數，不分頁 |

---

## 14. 建議分期

- **Phase 1**：`passbook_balances`(+import_seq) upsert + 1 個 `DELIMITED` 引擎 + `bank_format_profiles`/`import_logs`/`ledger_balances` 表 + 上傳/路由/檢核/寫入 + 轉檔歷程。打通單一銀行端到端。
- **Phase 2**：餘額維護畫面（兩餘額並陳、勾選編輯、全批覆核）+ 格式設定維護頁 + **試轉預覽**。
- **Phase 3**：`FIXED_WIDTH`、`EXCEL` 引擎；多檔處理；EXE 銀行逐家遷移。
- **Phase 4（未來）**：運算式/自訂轉換規則等進階增強。

> 跨模組相依：`ledger_balances` 由**結帳/日結流程**（另一模組）供應。該流程未完成前，此表需先 seed 測試資料。

---

_最後更新：2026-06-10。本文件與 `SD_DB_DESIGN.md`、`ARCHITECTURE.md` 配套；實作時若調整資料表請同步更新 `SD_DB_DESIGN.md`。_
