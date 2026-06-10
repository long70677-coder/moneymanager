# FUN2.1.1 存摺餘額轉檔 — 架構設計

> 本文件定義「存摺餘額轉檔」的技術架構：如何讓**多家銀行、不同格式**的餘額檔，吃進**同一個目標表** `passbook_balances`，且**新增銀行／調整格式時盡量只改設定、不改程式**。
> 規格依據：`SA_TO_SD`（URS/SA）、`SD_DB_DESIGN.md`（資料表）、`suspense-app/ARCHITECTURE.md`（分層）。
> 狀態：**設計定稿中，尚未實作**。實作前請先確認 §11 待拍板事項。

---

## 1. 目的與範圍

- 提供資金管理課經辦匯入銀行帳戶存摺餘額，寫入 `passbook_balances`，供後續日常／二次暫收比對。
- 來源銀行格式不固定、且會變動 → 架構必須**可擴充**且**設定驅動**。
- 範圍：檔案上傳 → 解析 → 對應 → 檢核 → 寫入 → 轉檔歷程；含銀行格式設定維護與試轉預覽。
- 不在本文件範圍：暫收交易（FUN2.1.2，另見既有實作）、日結、通報。

---

## 2. 設計原則（不可違反）

1. **三段式正規化**：Parse → Map → Validate+Write，中間以 canonical 標準格式銜接。
2. **單一寫入路徑**：所有銀行最終走同一段「檢核＋寫入」，與銀行無關 → 保證「多格式吃進同一表」。
3. **不寫死格式**：欄位對應、日期/金額/編碼/幣別對照一律放**設定**（`bank_format_profiles`），不寫進程式。
4. **引擎參數化**：解析引擎只有少數幾種通用型（分隔／固定寬／Excel），行為由設定參數驅動。
5. **EXE 降級為一種 parser**：既有外部轉檔 EXE 不是架構前提，視為 `StandardCsvParser` 這一條 adapter，可與原生 parser 並存、逐家汰換。
6. **分層**：遵循 `ARCHITECTURE.md`，route → service → repository → db。

---

## 3. 整體流程

```
銀行原始檔(多種格式)
      │  上傳（可多檔）
      ▼
┌─ Parse ─────────┐   每家不同：依設定選通用引擎，處理編碼/分隔/固定寬/Excel/略過表頭
│ BankBalanceParser│   輸出：RawRow[]（原始字串列 + 行號）
└─────────────────┘
      ▼
┌─ Map ───────────┐   每家不同（但靠設定，不靠程式）：
│ Profile Mapping  │   欄位對應、民國年/日期格式、金額格式、幣別對照
└─────────────────┘   輸出：NormalizedBalanceRecord[]（標準格式）
      ▼
┌─ Validate+Write ┐   ★完全共用、與銀行無關★
│ ingest.service   │   檢核（§6）→ 寫入 passbook_balances（覆蓋規則 §7）→ 寫轉檔歷程
└─────────────────┘
      ▼
  passbook_balances（目標表） + import_logs（歷程）
```

---

## 4. Canonical 標準格式

每個 parser／mapping 不論原檔多怪，最終都吐出這個結構。**這是整個功能的接點。**

```ts
/** 標準餘額記錄：所有銀行 parse+map 後的共同輸出 */
interface NormalizedBalanceRecord {
  balanceDate: string;   // 已轉 ISO yyyy-mm-dd
  accountCode: string;   // 已對應本系統帳號短碼
  currency: string;      // 已對應本系統幣別碼（NTD/USD/...）
  balance: number;       // 已轉數字（去千分位/全形/括號負號）
  sourceRow: number;     // 原檔行號，供錯誤回報定位
  raw?: Record<string, string>; // 原始欄位（稽核/除錯用，可選）
}

/** 單列解析/檢核錯誤 */
interface RowError {
  sourceRow: number;
  field?: string;
  message: string;
}
```

---

## 5. 三段詳細設計

### 5.1 Parse（解析引擎，可插拔）

```ts
interface BankBalanceParser {
  engine: ParserEngine;                 // 此 parser 對應的引擎類型
  parse(file: Buffer, profile: BankFormatProfile): RawRow[];
}
type ParserEngine = "DELIMITED" | "FIXED_WIDTH" | "EXCEL";
interface RawRow { sourceRow: number; cells: Record<string, string>; }
```

- **通用引擎（內建，少量）**：
  | 引擎 | 適用 | 主要設定參數 |
  |------|------|--------------|
  | `DELIMITED` | CSV / TXT 以分隔符切欄 | encoding、delimiter、skip_rows、has_header |
  | `FIXED_WIDTH` | 固定寬度欄位 | encoding、skip_rows、欄位起訖位置 |
  | `EXCEL` | xls / xlsx | sheet_name、skip_rows、has_header |
- **Registry**：以 `engine` 註冊查找；新增「全新結構類型」（如未來要吃 XML）= 新增一個引擎，**一次性**，之後同類型都吃設定。
- **EXE 整合**：舊 EXE 產出的標準 CSV → 用 `DELIMITED` 引擎一筆 profile 即可吃，無需特別寫 parser。

### 5.2 Map（欄位對應，設定驅動）

- 對應規則全部放 `bank_format_profiles`（§8.1），**不寫程式**：
  - 欄位對應（來源欄名或欄位序 → canonical 欄位）
  - 日期格式（含民國年，如 `YYY/MM/DD`）→ ISO
  - 金額格式（千分位、括號負數、全形、正負號位置）→ number
  - 幣別對照（如 `01→NTD`、`TWD→NTD`）
  - 帳號對應（原則上檔內帳號＝本系統帳號短碼；如需轉換，於對照設定處理）
- 對應後產出 `NormalizedBalanceRecord[]`，對不上的列收集為 `RowError`。

### 5.3 Validate + Write（共用，與銀行無關）

- 檢核見 §6；寫入與覆蓋見 §7；歷程見 §8.2。
- 多表/多列寫入包在單一 `db.transaction()`（依 `ARCHITECTURE.md` 由 service 開）。
- **部分成功**：可設定為「全有或全無」或「逐列轉、錯誤列略過」（建議預設逐列、彙整錯誤回報）。

---

## 6. 轉檔檢核規則（來源：SA_TO_SD L97–113）

寫入前須通過：

1. 必填欄位未填（餘額日期／帳號／幣別／餘額）→ 不可轉檔。
2. **檔案內餘額日期須與畫面餘額日期一致**。
3. 帳號須存在於 `bank_accounts` 且為**暫收帳戶**（`is_suspense=1`）。
4. **T-1 餘額轉入**：檢查該幣別當日是否已有**日常暫收批號**（有則依規則擋）。
5. **T 日餘額轉入**：檢查該帳號+幣別是否已有**二次暫收批號**。
6. 該作帳日該幣別類型**已日結** → 不可轉入 T-1 餘額。
7. 帳號須在**操作者可維護範圍**內（沿用現有權限模型 `getAccessibleAccountCodes`）。
8. **多檔含同一「帳號短碼+幣別+日期」** → 取捨規則 **待拍板**（§11），預設建議「以檔案順序後者覆蓋前者」並記錄於歷程。

---

## 7. 寫入與覆蓋規則（來源：SA_TO_SD L106–113）

- 目標表：`passbook_balances`，邏輯 key = `balance_date + account_code + currency`。
- 資料類型 `data_type`：`FILE_IMPORT`（檔案轉入）/ `PREV_DAY`（前日）/ `MANUAL`（手動）。
- **重複轉檔僅覆蓋 `data_type='FILE_IMPORT'` 的資料**；手動/前日資料不覆蓋。
- 全幣別轉檔但部分幣別已立暫收 → **僅轉入尚未立暫收部分**。
- 「前日餘額／手動輸入」可於畫面編輯；「檔案轉入」不可編輯餘額。
- 前日餘額被人工修改後儲存 → `data_type` 改為 `MANUAL`。
- 轉入資料 `is_reviewed=0`，須經覆核（暫收計算只吃 `is_reviewed=1` 且已儲存的餘額）。

---

## 8. 資料表設計

### 8.1 `bank_format_profiles`（銀行格式設定檔 — 新增）

> 設定驅動的核心。新增銀行／調整格式 = 改此表，不動程式。

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | INTEGER | PK | |
| bank_code | TEXT | NOT NULL | 銀行代碼 |
| profile_name | TEXT | | 設定名稱（如「第一銀行 台幣餘額檔」） |
| engine | TEXT | NOT NULL | `DELIMITED` / `FIXED_WIDTH` / `EXCEL` |
| encoding | TEXT | DEFAULT 'UTF-8' | `UTF-8` / `BIG5` |
| delimiter | TEXT | | 分隔符（DELIMITED 用） |
| has_header | INTEGER | DEFAULT 1 | 是否有表頭列 |
| skip_rows | INTEGER | DEFAULT 0 | 略過前 N 行 |
| sheet_name | TEXT | | Excel 工作表名 |
| column_map | TEXT(JSON) | NOT NULL | 欄位對應（見下） |
| date_format | TEXT | | 來源日期格式（含民國年），如 `YYY/MM/DD` |
| amount_format | TEXT(JSON) | | 金額格式選項（千分位/括號負/全形…） |
| currency_map | TEXT(JSON) | | 幣別對照，如 `{"01":"NTD","TWD":"NTD"}` |
| currency_default | TEXT | | 檔內無幣別欄時的預設幣別 |
| version | INTEGER | DEFAULT 1 | 版本（同銀行可多版本） |
| effective_date | TEXT | | 生效日（排程切換格式用） |
| status | TEXT | DEFAULT 'DRAFT' | `DRAFT` / `ACTIVE` / `RETIRED` |
| is_reviewed | INTEGER | DEFAULT 0 | 設定是否覆核 |
| reviewed_by / reviewed_at | TEXT | | 覆核軌跡 |
| created_by / created_at | TEXT | | 建立軌跡 |
| updated_by / updated_at | TEXT | | 異動軌跡 |
| — | — | **UNIQUE(bank_code, version)** | |

`column_map`（JSON）範例 — 可用「欄名」或「欄位序」對應：
```jsonc
{
  "balanceDate": { "by": "name", "key": "交易日" },
  "accountCode": { "by": "name", "key": "帳號" },
  "currency":    { "by": "name", "key": "幣別" },
  "balance":     { "by": "index", "key": 6 }
}
```

DDL（SQLite，比照 `db.ts` 風格）：
```sql
CREATE TABLE IF NOT EXISTS bank_format_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_code TEXT NOT NULL,
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
  currency_default TEXT,
  version INTEGER DEFAULT 1,
  effective_date TEXT,
  status TEXT DEFAULT 'DRAFT',
  is_reviewed INTEGER DEFAULT 0,
  reviewed_by TEXT, reviewed_at TEXT,
  created_by TEXT DEFAULT 'System', created_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT DEFAULT 'System', updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(bank_code, version),
  FOREIGN KEY (bank_code) REFERENCES bank_accounts(bank_code)
);
```

### 8.2 `import_logs`（轉檔歷程 — 新增，來源：SA_TO_SD L259–267）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | |
| batch_id | TEXT | 上傳批次號（一次上傳一碼，可含多檔） |
| file_name | TEXT | 來源檔名 |
| bank_code | TEXT | 銀行代碼 |
| profile_id | INTEGER | 使用的格式設定 |
| balance_date | TEXT | 餘額日期 |
| total_count / success_count / fail_count | INTEGER | 筆數統計 |
| status | TEXT | `SUCCESS` / `PARTIAL` / `FAILED` |
| errors | TEXT(JSON) | 逐列錯誤（RowError[]） |
| uploaded_by / uploaded_at | TEXT | 上傳軌跡 |

```sql
CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  file_name TEXT,
  bank_code TEXT,
  profile_id INTEGER,
  balance_date TEXT,
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'SUCCESS',
  errors TEXT,
  uploaded_by TEXT DEFAULT 'System',
  uploaded_at TEXT DEFAULT (datetime('now'))
);
```

### 8.3 `passbook_balances`（目標表 — 既有，見 `SD_DB_DESIGN.md` §2）

不變動，作為寫入目標。轉檔寫入 `data_type='FILE_IMPORT'`、`file_name`、`is_reviewed=0`。

---

## 9. 銀行格式設定維護畫面

定位：系統設定 → 銀行格式維護（比照現有「基本資料維護」頁）。

功能：
1. **設定 CRUD**：§8.1 欄位的表單（引擎、編碼、分隔、欄位對應、日期/金額格式、幣別對照、生效日、版本）。
2. **試轉預覽（dry-run）★最重要**：上傳樣本檔 → 後端用該設定**只解析不寫入** → 回傳前 N 列解析結果與錯誤，讓經辦自行驗證格式正確再套用。銀行改格式時不需找工程師。
3. **覆核**：設定變更可設「覆核後 ACTIVE 生效」。

畫面草圖：
```
┌─ 銀行格式設定：012 第一銀行（v2，2026-07-01 生效）──┐
│ 引擎[分隔檔▼] 編碼[Big5▼] 分隔[,] 略過[1]行 表頭[有]│
│ 餘額日期←[交易日]  格式[民國 YYY/MM/DD]              │
│ 帳號短碼←[帳號]    幣別←[幣別] 對照:01→NTD,TWD→NTD  │
│ 餘額←欄[7]  金額格式[千分位,括號負]                  │
│ ───────────────────────────────────────────────────│
│ [上傳樣本試轉] → 預覽前10列解析結果（含錯誤標示）    │
│ 生效日[2026-07-01]  狀態[草稿]  [儲存] [儲存並送覆核]│
└──────────────────────────────────────────────────────┘
```

---

## 10. 設定可改 vs 需加引擎（界線，務必對齊認知）

| 變動 | 只改設定？ |
|------|:---:|
| 新增銀行（格式屬 分隔／固定寬／Excel 之一） | ✅ |
| 既有銀行調整：欄序、欄名、增減欄、日期格式、金額寫法、編碼、表頭行數 | ✅ |
| 幣別／帳號代碼對照調整 | ✅ |
| 出現**全新檔案結構類型**（XML/JSON/PDF/壓縮檔…） | ⚠️ 一次性新增引擎 |
| 需**客製運算**（多欄相加、跨列計算） | ⚠️ 需寫轉換邏輯 |

預估：日常變動約 8–9 成可純設定完成。降低「需改程式」比例的進階做法（運算式欄位）列為**未來增強**，第一版不做。

---

## 11. EXE 漸進汰換策略

1. 既有 EXE 流程**不立即廢除**：其輸出的標準 CSV 建一筆 `DELIMITED` profile，照常吃。
2. 新銀行優先寫**原生 parser/設定**，不再經 EXE。
3. 既有銀行逐家把「EXE→CSV」改為系統內原生解析，驗證（試轉預覽）通過後切換。
4. 全數遷移後再評估退役 EXE。**全程兩條路並存，無 big-bang。**

---

## 12. 對應現有分層架構（`ARCHITECTURE.md`）

```
app/api/
  balance-import/route.ts        # 收檔上傳→呼叫 ingest.service
  bank-formats/route.ts          # 格式設定 CRUD + 試轉預覽
  balances/route.ts              # 餘額查詢/人工維護/覆核（FUN2.1.1 畫面）
services/
  ingest.service.ts              # 協調 parse→map→validate→write→log
  parsers/                       # 通用引擎 + registry（DELIMITED/FIXED_WIDTH/EXCEL）
  mapping.ts                     # 依 profile 做 Map（日期/金額/幣別/欄位）
repositories/
  balance.repo.ts                # passbook_balances（已有雛形，擴充 upsert FILE_IMPORT）
  bankFormat.repo.ts             # bank_format_profiles（新）
  importLog.repo.ts              # import_logs（新）
domain/
  ingest.types.ts                # NormalizedBalanceRecord / RowError / ParserEngine
```

引擎 registry 是唯一「加程式」的擴充點；其餘變化吃設定。完全符合分層（route→service→repository→db）。

---

## 13. 待拍板事項（實作前必須確認）

| # | 議題 | 影響 |
|---|------|------|
| 1 | 系統只吃「標準化後檔案」還是內建多銀行 parser？ | 決定第一版開發範圍 |
| 2 | 標準 CSV 欄位/日期/金額/幣別格式定稿 | parser/profile 預設值 |
| 3 | 多檔同一「帳號+幣別+日期」重複 → 覆蓋/拒絕/取最後？ | §6.8 寫入規則 |
| 4 | 「覆核」是單筆/全批/僅作門檻？是否記錄覆核人時間？ | 覆核流程與欄位 |
| 5 | 「前日餘額」來源 = 前一日存摺餘額檔 還是 帳列餘額？ | Map/顯示邏輯 |
| 6 | 部分成功策略：逐列轉並略過錯誤，或全有全無？ | §5.3 |
| 7 | 台幣/外幣共用畫面不同節點，是否同功能不同參數？ | 畫面與規則 |

---

## 14. 建議分期

- **Phase 1**：`passbook_balances` upsert + 1 個 `DELIMITED` 引擎 + `bank_format_profiles`/`import_logs` 表 + 上傳/檢核/寫入 + 轉檔歷程。先打通單一銀行端到端。
- **Phase 2**：格式設定維護畫面 + **試轉預覽** + 覆核/生效日治理。
- **Phase 3**：`FIXED_WIDTH`、`EXCEL` 引擎；多檔處理；既有 EXE 銀行逐家遷移。
- **Phase 4（未來）**：運算式/自訂轉換規則等進階增強。

---

_最後更新：2026-06-10。本文件與 `SD_DB_DESIGN.md`、`ARCHITECTURE.md` 配套；實作時若調整資料表請同步更新 `SD_DB_DESIGN.md`。_
