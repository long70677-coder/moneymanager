# SD 資料庫設計文件 — 暫收交易模組（FUN2.1.1 / FUN2.1.2）

> 對應 SA 文件 `SA_TO_SD`。本文件描述目前 `suspense-app` 實作（SQLite，`src/lib/db.ts`）的資料結構，並標註與 SA 規格的落差。
> 資料庫引擎：SQLite（better-sqlite3，WAL 模式）。正式環境預期改用企業級 DB（待定）。

---

## 一、資料表總覽

| # | 資料表 | 中文名稱 | 對應功能 | 狀態 |
|---|--------|----------|----------|------|
| 1 | `bank_accounts` | 銀行帳戶基本資料 | 基礎主檔 | ✅ 已實作 |
| 2 | `passbook_balances` | 存摺餘額資料檔 | FUN2.1.1 | ⚠️ 表已建，轉檔功能未實作 |
| 3 | `suspense_transactions` | 暫收交易檔 | FUN2.1.2 | ✅ 已實作 |
| 4 | `batch_confirmations` | 批號確認狀態檔 | FUN2.1.2 | ✅ 已實作 |
| 5 | `voucher_entries` | 傳票明細檔 | 會計介接 | ✅ 已實作 |
| 6 | `report_details` | 通報明細檔 | 通報介接 | ✅ 已實作 |
| 7 | `sequence_counters` | 自動跳號表 | 共用基礎 | ✅ 已實作 |
| 8 | `users` | 使用者 | 權限控制 | ✅ 已實作 |
| 9 | `account_managers` | 帳號維護人員（主辦/代理） | 權限控制 | ✅ 已實作 |
| 10 | `bank_format_profiles` | 銀行格式設定檔 | FUN2.1.1 | 📐 已設計，未實作 |
| 11 | `import_logs` | 轉檔歷程檔 | FUN2.1.1 | 📐 已設計，未實作 |
| 12 | `ledger_balances` | 帳列餘額檔 | FUN2.1.1／結帳 | 📐 已設計，未實作 |
| 13 | `currencies` | 幣別對照 | 共用基礎 | ✅ 已實作（維護框架） |
| 14 | `exchange_rates` | 匯率檔 | 共用基礎 | ✅ 已實作（維護框架） |
| 15 | `holidays` | 假日檔（營業日判斷） | 共用基礎 | ✅ 已實作（維護框架） |
| 16 | `banks` | 銀行基本資料（最小版） | URS2.90.201/202 | ✅ 已實作（總行代號/銀行代碼/簡稱；完整版待 FUN2.90.201 規格） |
| 17 | `code_maps` | 對照碼檔 | URS 共用 | ✅ 已實作（Category+Code 唯一；存款類別/帳冊別/幣別類型/外幣帳戶類型/領息方式/計息天數） |

> **URS2.90.202**：`bank_accounts` 擴充欄位——排列序號、存款類別、幣別、銀存子目（5碼 unique）、帳冊別、
> 外幣帳戶類型、記帳幣（推導：外幣保單=原幣，其餘 NTD）、FEDI/公司主調度/同行主調度（同總行唯一）/票匯、
> 活存領息方式（支存固定「無」）/計息天數、備註、開戶/停用/銀行結清/公司結清日期。
> 新增唯一鍵：UNIQUE(bank_code, account_code)（檢核 C-i）、UNIQUE(subject_code)（檢核 C-ii）。

> 第 10–12 表為 FUN2.1.1 轉檔的設計產物，完整設計見 `FUN2.1.1_轉檔架構設計.md`。`ledger_balances` 由後續「結帳/日結流程」供應，FUN2.1.1 僅唯讀消費。

> **業務規則：單一批號僅限單一幣別** — 批號自動跳號以「類型＋日期＋幣別」為 key，後端於新增時拒絕同批號混用不同幣別，查詢亦要求指定單一幣別。
>
> **權限模型** — 使用者分 `STAFF`（經辦）與 `MANAGER`（主管）。經辦僅能檢視/操作其於 `account_managers` 中主辦或代理（且代理期間有效）的帳號；主管不受限。立暫收新增、查詢、批號確認/取消確認、刪除皆套用此範圍。（目前以「目前操作者切換器」作為登入機制的 demo 替身。）

---

## 二、ER 關係圖

```
bank_accounts ──┬─< passbook_balances        (account_code FK)
                └─< suspense_transactions     (account_code FK)

suspense_transactions ──(batch_no 邏輯對應)── batch_confirmations
        │
        ├─ 批號確認 ─→ voucher_entries（傳票，借貸各一行）
        └─ 批號確認 ─→ report_details（通報，僅日常暫收 DAILY）

sequence_counters ── 提供 batch_no 自動跳號（counter_key = BATCH_{type}_{yyyymmdd}_{currency}）

bank_accounts ──< account_managers >── users   (account_code FK / user_id FK；主辦 PRIMARY、代理 AGENT)
```

實體外鍵（FK）目前 4 條：
- `passbook_balances.account_code` → `bank_accounts.account_code`
- `suspense_transactions.account_code` → `bank_accounts.account_code`
- `account_managers.account_code` → `bank_accounts.account_code`
- `account_managers.user_id` → `users.id`

其餘（voucher / report / batch_confirmation）皆以 `batch_no` 邏輯關聯，未建實體 FK。

---

## 三、各資料表欄位定義

### 1. `bank_accounts`（銀行帳戶基本資料）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK, AUTOINCREMENT | 流水號 |
| account_code | TEXT | **UNIQUE, NOT NULL** | 帳號短碼（業務 key） |
| account_long_code | TEXT | NOT NULL | 帳號長碼（傳票摘要用） |
| bank_code | TEXT | NOT NULL | 銀行代碼 |
| account_name | TEXT | NOT NULL | 帳戶名稱 |
| account_purpose | TEXT | NOT NULL | 帳號用途 |
| is_suspense | INTEGER | DEFAULT 1 | 是否暫收帳戶（1=是） |
| is_policy_account | INTEGER | DEFAULT 0 | 是否保單帳戶（影響匯率固定為 1） |
| currency_type | TEXT | DEFAULT 'TWD' | 幣別類型：TWD / FOREIGN |
| `import_file_name` | TEXT | （FUN2.1.1 新增） | 該帳號餘額檔的檔名（一檔一帳號；轉檔時以檔名對到帳號） |
| `is_active` | INTEGER | DEFAULT 1（維護框架新增） | 啟用旗標：停用後不再參與餘額維護/轉檔比對/暫收立帳 |
| created_by / created_at | TEXT | （維護框架新增 created_by） | 建立軌跡 |
| updated_by / updated_at | TEXT | （維護框架新增 updated_by） | 異動軌跡 |

> 維護規則（SD_MASTER_FRAMEWORK.md）：account_code 為業務主鍵，建立後不可修改；
> 被存摺餘額／暫收交易／帳號維護權限參照的帳號不可刪除，只能停用。

> FUN2.1.1 轉檔時，profile **不另存欄位**，由系統依「`bank_code` ＋ 帳號幣別」即時帶出（精確幣別→`ZZZ` fallback），唯讀不可手改。

### 2. `passbook_balances`（存摺餘額資料檔 ← FUN2.1.1）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| balance_date | TEXT | NOT NULL | 餘額日期 |
| account_code | TEXT | NOT NULL, FK→bank_accounts | 帳號短碼 |
| currency | TEXT | NOT NULL | 幣別 |
| balance | REAL | DEFAULT 0 | 餘額 |
| data_type | TEXT | DEFAULT 'PREV_DAY' | 資料類型：PREV_DAY（前日）/ FILE_IMPORT（檔案轉入）/ MANUAL（手動） |
| `import_seq` | INTEGER | DEFAULT 1（FUN2.1.1 新增） | **轉入次別**：同日二次轉入用；一般=1，二次轉入=前次最大+1 |
| file_name | TEXT | | 來源檔名 |
| memo | TEXT | | 備註 |
| is_reviewed | INTEGER | DEFAULT 0 | 是否覆核（**全批覆核**：以餘額日期＋幣別為單位） |
| reviewed_by / reviewed_at | TEXT | | 覆核人員 / 時間 |
| created_by / created_at | TEXT | | 建立軌跡 |
| updated_by / updated_at | TEXT | | 異動軌跡 |
| — | — | **UNIQUE(balance_date, account_code, currency, import_seq)** | 邏輯唯一鍵（含轉入次別） |

> ⚠️ **落差**：此表已建立並有 seed，但轉檔功能（FUN2.1.1）尚未實作。`import_seq` 與唯一鍵調整為設計決議，實作時一併套用。
> 📐 **轉檔規則**：重傳更正覆蓋最新次別（已立暫收須先取消）；勾「二次轉入」則 `import_seq+1` 保留前筆；下游立暫收取最新次別。詳見 `FUN2.1.1_轉檔架構設計.md` §7。

### 3. `suspense_transactions`（暫收交易檔 ← FUN2.1.2 核心）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| transaction_no | TEXT | **UNIQUE, NOT NULL** | 暫收交易單號 |
| suspense_date | TEXT | NOT NULL | 暫收日期 |
| suspense_type | TEXT | NOT NULL | DAILY（日常）/ MANUAL（手工）/ SECONDARY（二次） |
| batch_no | TEXT | NOT NULL | 批號 |
| bank_code | TEXT | NOT NULL | 銀行代碼 |
| account_code | TEXT | NOT NULL, FK→bank_accounts | 帳號短碼 |
| currency | TEXT | NOT NULL | 幣別 |
| prev_company_balance | REAL | DEFAULT 0 | 前日公司帳列餘額（日常暫收基準） |
| prev_passbook_balance | REAL | DEFAULT 0 | 前日存摺餘額 |
| today_company_balance | REAL | DEFAULT 0 | 今日公司帳列餘額（二次暫收基準） |
| today_passbook_balance | REAL | DEFAULT 0 | 今日存摺餘額 |
| total_suspense_amount | REAL | DEFAULT 0 | 總立暫收金額 |
| suspense_amount | REAL | DEFAULT 0 | **立暫收金額 = 存摺餘額 − 公司帳列餘額** |
| exchange_rate | REAL | DEFAULT 1 | 匯率（台幣/保單帳戶=1） |
| suspense_amount_local | REAL | DEFAULT 0 | 立暫收金額（記帳幣）= 立暫收金額 × 匯率 |
| is_confirmed | INTEGER | DEFAULT 0 | 批號是否已確認 |
| is_day_closed | INTEGER | DEFAULT 0 | 是否已日結 |
| is_report_locked | INTEGER | DEFAULT 0 | 是否已通報鎖定 |
| version | INTEGER | DEFAULT 0 | **樂觀鎖版本號** |
| created_by / created_at | TEXT | | 建立軌跡 |
| updated_by / updated_at | TEXT | | 異動軌跡 |
| — | — | **UNIQUE(suspense_date, suspense_type, currency, batch_no, account_code)** | 業務唯一鍵 |

**立暫收金額計算邏輯（依類型）：**
- 日常暫收（DAILY）：公司帳列取 T-1 日結後餘額、存摺取 T-1 已覆核餘額；`suspense_amount = prev_passbook − prev_company`
- 二次暫收（SECONDARY）：公司帳列取 T 日試算後、存摺取 T 日已覆核；`suspense_amount = today_passbook − today_company`
- 手工暫收（MANUAL）：初值 0，由使用者輸入

### 4. `batch_confirmations`（批號確認狀態檔）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| suspense_date | TEXT | NOT NULL | 暫收日期 |
| currency | TEXT | NOT NULL | 幣別 |
| batch_type | TEXT | NOT NULL | 批號類型（目前存暫收類型 DAILY/MANUAL/SECONDARY） |
| batch_no | TEXT | NOT NULL | 批號 |
| confirm_status | TEXT | DEFAULT 'UNCONFIRMED' | UNCONFIRMED / CONFIRMED |
| confirmed_by / confirmed_at | TEXT | | 確認人員 / 時間 |
| cancelled_by / cancelled_at | TEXT | | 取消確認人員 / 時間 |
| version | INTEGER | DEFAULT 0 | 樂觀鎖 |
| created_at / updated_at | TEXT | | 軌跡 |
| — | — | **UNIQUE(suspense_date, currency, batch_type, batch_no)** | 唯一鍵 |

### 5. `voucher_entries`（傳票明細檔 ← 批號確認後產生）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | 流水號 |
| voucher_no | TEXT NOT NULL | 傳票號碼（V-{batch_no}-{seq}） |
| suspense_date | TEXT NOT NULL | 暫收日期 |
| batch_no / batch_type | TEXT NOT NULL | 批號 / 類型 |
| account_code | TEXT NOT NULL | 帳號短碼 |
| currency | TEXT NOT NULL | 幣別 |
| debit_credit | TEXT NOT NULL | 借貸別：D（借）/ C（貸） |
| accounting_code | TEXT NOT NULL | 會計科目（現寫死：台幣 1131/2141、外幣 1132/2142） |
| amount | REAL NOT NULL | 金額（原幣，取絕對值） |
| amount_local | REAL NOT NULL | 金額（記帳幣） |
| summary | TEXT NOT NULL | 摘要（帶批號＋帳號長碼） |
| created_by / created_at | TEXT | 軌跡 |

> 每筆 `suspense_amount != 0` 的暫收交易產生**借貸各一行**；金額為負時借貸方向反轉。

### 6. `report_details`（通報明細檔 ← 僅日常暫收）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | 流水號 |
| suspense_date | TEXT NOT NULL | 暫收日期 |
| batch_no | TEXT NOT NULL | 批號 |
| account_code | TEXT NOT NULL | 帳號短碼 |
| currency | TEXT NOT NULL | 幣別 |
| item_code | TEXT NOT NULL | 大表項目代號（現為固定值，待 mapping3 對照） |
| debit_credit | TEXT DEFAULT 'D' | 借貸別（固定借 D） |
| amount | REAL NOT NULL | 金額 |
| report_source | TEXT DEFAULT '5' | 通報來源（固定 5 = 暫收） |
| created_by / created_at | TEXT | 軌跡 |

### 7. `sequence_counters`（自動跳號表）

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | INTEGER PK | 流水號 |
| counter_key | TEXT UNIQUE NOT NULL | 跳號鍵，格式 `BATCH_{type}_{yyyymmdd}_{currency}` |
| current_value | INTEGER DEFAULT 0 | 目前號碼 |

### 8. `users`（使用者）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| user_code | TEXT | UNIQUE, NOT NULL | 使用者代號（建立後不可修改） |
| user_name | TEXT | NOT NULL | 姓名 |
| role | TEXT | NOT NULL DEFAULT 'STAFF' | 角色：STAFF（經辦）/ MANAGER（主管） |
| `is_active` | INTEGER | DEFAULT 1（維護框架新增） | 啟用旗標：停用後不可切換為操作者、權限視同無 |
| created_by / created_at | TEXT | （維護框架新增 created_by） | 建立軌跡 |
| updated_by / updated_at | TEXT | （維護框架新增） | 異動軌跡 |

> 業務規則：系統至少保留一位「啟用中的主管」（停用/降級最後一位主管會被阻擋）；
> 被 `account_managers` 參照的使用者不可刪除，只能停用。

### 9. `account_managers`（帳號維護人員）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| account_code | TEXT | NOT NULL, FK→bank_accounts | 帳號短碼 |
| user_id | INTEGER | NOT NULL, FK→users | 使用者 |
| manager_type | TEXT | NOT NULL DEFAULT 'PRIMARY' | PRIMARY（主辦）/ AGENT（代理） |
| valid_from | TEXT | | 代理生效日（NULL=不限；主辦不適用，儲存時清空） |
| valid_to | TEXT | | 代理截止日（NULL=不限） |
| created_by / created_at | TEXT | （維護框架新增 created_by） | 建立軌跡 |
| updated_by / updated_at | TEXT | （維護框架新增） | 異動軌跡 |
| — | — | **UNIQUE(account_code, user_id, manager_type)** | 唯一鍵 |

> 指派紀錄＝關聯資料，允許實體刪除（不做軟刪除）；指派對象限啟用中的使用者與帳號。

> 權限判斷對應 SA「同時考量主維護人 + 代理維護人 + 代理有效期間」。`getAccessibleAccountCodes(db, userId, refDate)` 依參考日期（暫收日期）回傳可存取帳號；主管回傳 null（全部）。

### 10. `bank_format_profiles`（銀行格式設定檔 ← FUN2.1.1，📐 設計）

銀行餘額檔的解析設定，**鍵 = 銀行＋幣別（＋版本）**，幣別可用 `ZZZ` 表該行共用/外幣格式。主要欄位：engine（DELIMITED/FIXED_WIDTH/EXCEL）、encoding、delimiter、skip_rows、column_map(JSON)、date_format、amount_format、currency_map、version、effective_date、status、覆核軌跡。唯一鍵 **UNIQUE(bank_code, currency, version)**。完整 DDL 見 `FUN2.1.1_轉檔架構設計.md` §8.1。

### 11. `import_logs`（轉檔歷程檔 ← FUN2.1.1，📐 設計）

每次轉檔的批次軌跡：batch_id、file_name、account_code、profile_id、balance_date、total/success/fail_count、status（SUCCESS/PARTIAL/FAILED）、errors(JSON)、上傳人員/時間。對應 SA 第四節「轉檔歷程/介面 log」。完整定義見 `FUN2.1.1_轉檔架構設計.md` §8.3。

### 12. `ledger_balances`（帳列餘額檔 ← FUN2.1.1／結帳，📐 設計）

公司內部帳列餘額（本日結餘），由**結帳/日結流程**寫入；FUN2.1.1（畫面「系統前日帳列餘額」）與 FUN2.1.2（`prev_company_balance` 來源）皆**唯讀消費**。主要欄位：balance_date、account_code(FK)、currency、balance（結餘）、is_closed、closed_at、軌跡。唯一鍵 **UNIQUE(balance_date, account_code, currency)**。完整 DDL 見 `FUN2.1.1_轉檔架構設計.md` §8.4。

### 13. `currencies`（幣別對照 ← 共用基礎）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| code | TEXT | UNIQUE, NOT NULL | 幣別代碼（NTD/USD…，建立後不可修改） |
| name | TEXT | NOT NULL | 幣別名稱 |
| currency_type | TEXT | DEFAULT 'FOREIGN' | TWD / FOREIGN（台外幣作業分流） |
| decimal_places | INTEGER | DEFAULT 2 | 金額顯示小數位（NTD/JPY=0） |
| is_active＋審計欄位 | | | 維護框架共通欄位 |

> 暫收／餘額轉檔畫面的幣別下拉、名稱、金額格式皆由本表供應；被匯率/交易參照後只能停用。

### 14. `exchange_rates`（匯率檔 ← 共用基礎）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| rate_date | TEXT | UNIQUE(rate_date, currency_code) | 匯率日期 |
| currency_code | TEXT | 〃 | 幣別（不含 NTD，記帳幣恆 1） |
| rate | NUMERIC | NOT NULL, >0 | 1 外幣 = ? NTD |
| 審計欄位 | | | |

> 立暫收取「暫收日期（含）以前最近一筆」（SA 業務規則）；查無匯率擋下立帳。交易留存匯率快照，異動歷史匯率不影響既有交易，故允許實體刪除。

### 15. `holidays`（假日檔 ← 共用基礎）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| holiday_date | TEXT | UNIQUE, NOT NULL | 假日日期 |
| name | TEXT | NOT NULL | 假日名稱 |
| 審計欄位 | | | |

> 營業日判斷＝排除週六日＋本表日期；`PrevBusinessDay`/`NextBusinessDay`（T-1、轉檔次日推算）引用。

---

## 四、與 SA 規格的落差清單（待 SA / 業務決策）

| # | 落差項目 | 現況 | 建議 |
|---|----------|------|------|
| 1 | **轉檔歷程 log 表未建** | SA 第四節建議的上傳批次/檔名/成功失敗筆數/錯誤訊息 log 表未實作（FUN2.1.1 整體缺口） | 📐 已設計 `import_logs`（見 FUN2.1.1 設計 §8.3），待實作 |
| 2 | **匯率來源寫死** | 外幣匯率為 demo 預設 `31.5`，無匯率檔 | 建 `exchange_rates` 表，依暫收日期取最近一筆 |
| 3 | **實體 FK 僅 2 條** | voucher/report/batch_confirmation 靠 batch_no 邏輯關聯 | 評估是否補實體 FK 或維持邏輯關聯 |
| 4 | **batch_type 定義** | 直接存暫收類型，對應 SA 待確認議題第 8 點 | 明確定義批號類型編碼規則，避免 key 衝突 |
| 5 | **會計科目 / 通報項目寫死** | 科目 1131/1132/2141/2142、通報 item_code 寫死於程式 | 建科目對照表與通報項目 mapping3 |
| 6 | ~~代理維護權限表未建~~ | ✅ 已補：`users` + `account_managers`（主辦/代理/有效期間），並套用於查詢、新增、確認、刪除 | 後續接真實登入機制取代切換器 |
| 7 | **沖暫收未納入** | 本期結構未含沖暫收 | 確認是否本期保留資料結構或不做 |

---

*文件版本：v1.1｜對應程式：`suspense-app/src/lib/db.ts`｜FUN2.1.1 轉檔設計：`FUN2.1.1_轉檔架構設計.md`*
*v1.1 異動：passbook_balances 加 import_seq 並改唯一鍵；bank_accounts 加 import_file_name；新增 bank_format_profiles / import_logs / ledger_balances（皆設計階段，未實作）。*
