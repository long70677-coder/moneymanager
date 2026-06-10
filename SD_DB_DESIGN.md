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
| created_at / updated_at | TEXT | DEFAULT datetime('now') | 建立 / 異動時間 |

### 2. `passbook_balances`（存摺餘額資料檔 ← FUN2.1.1）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| balance_date | TEXT | NOT NULL | 餘額日期 |
| account_code | TEXT | NOT NULL, FK→bank_accounts | 帳號短碼 |
| currency | TEXT | NOT NULL | 幣別 |
| balance | REAL | DEFAULT 0 | 餘額 |
| data_type | TEXT | DEFAULT 'PREV_DAY' | 資料類型：PREV_DAY（前日）/ FILE_IMPORT（檔案轉入）/ MANUAL（手動） |
| file_name | TEXT | | 來源檔名 |
| memo | TEXT | | 備註 |
| is_reviewed | INTEGER | DEFAULT 0 | 是否覆核 |
| reviewed_by / reviewed_at | TEXT | | 覆核人員 / 時間 |
| created_by / created_at | TEXT | | 建立軌跡 |
| updated_by / updated_at | TEXT | | 異動軌跡 |
| — | — | **UNIQUE(balance_date, account_code, currency)** | 邏輯唯一鍵 = 餘額日期＋帳號短碼＋幣別 |

> ⚠️ **落差**：此表已建立並有 seed 資料，但檔案上傳 / 解析 / 轉檔功能（FUN2.1.1）尚未實作，目前無寫入路徑。

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
| user_code | TEXT | UNIQUE, NOT NULL | 使用者代號 |
| user_name | TEXT | NOT NULL | 姓名 |
| role | TEXT | NOT NULL DEFAULT 'STAFF' | 角色：STAFF（經辦）/ MANAGER（主管） |
| created_at | TEXT | | 建立時間 |

### 9. `account_managers`（帳號維護人員）

| 欄位 | 型別 | 鍵/約束 | 說明 |
|------|------|---------|------|
| id | INTEGER | PK | 流水號 |
| account_code | TEXT | NOT NULL, FK→bank_accounts | 帳號短碼 |
| user_id | INTEGER | NOT NULL, FK→users | 使用者 |
| manager_type | TEXT | NOT NULL DEFAULT 'PRIMARY' | PRIMARY（主辦）/ AGENT（代理） |
| valid_from | TEXT | | 代理生效日（NULL=不限） |
| valid_to | TEXT | | 代理截止日（NULL=不限） |
| created_at | TEXT | | 建立時間 |
| — | — | **UNIQUE(account_code, user_id, manager_type)** | 唯一鍵 |

> 權限判斷對應 SA「同時考量主維護人 + 代理維護人 + 代理有效期間」。`getAccessibleAccountCodes(db, userId, refDate)` 依參考日期（暫收日期）回傳可存取帳號；主管回傳 null（全部）。

---

## 四、與 SA 規格的落差清單（待 SA / 業務決策）

| # | 落差項目 | 現況 | 建議 |
|---|----------|------|------|
| 1 | **轉檔歷程 log 表未建** | SA 第四節建議的上傳批次/檔名/成功失敗筆數/錯誤訊息 log 表未實作（FUN2.1.1 整體缺口） | 補 `import_logs` 表並實作轉檔功能 |
| 2 | **匯率來源寫死** | 外幣匯率為 demo 預設 `31.5`，無匯率檔 | 建 `exchange_rates` 表，依暫收日期取最近一筆 |
| 3 | **實體 FK 僅 2 條** | voucher/report/batch_confirmation 靠 batch_no 邏輯關聯 | 評估是否補實體 FK 或維持邏輯關聯 |
| 4 | **batch_type 定義** | 直接存暫收類型，對應 SA 待確認議題第 8 點 | 明確定義批號類型編碼規則，避免 key 衝突 |
| 5 | **會計科目 / 通報項目寫死** | 科目 1131/1132/2141/2142、通報 item_code 寫死於程式 | 建科目對照表與通報項目 mapping3 |
| 6 | ~~代理維護權限表未建~~ | ✅ 已補：`users` + `account_managers`（主辦/代理/有效期間），並套用於查詢、新增、確認、刪除 | 後續接真實登入機制取代切換器 |
| 7 | **沖暫收未納入** | 本期結構未含沖暫收 | 確認是否本期保留資料結構或不做 |

---

*文件版本：v1.0｜對應程式：`suspense-app/src/lib/db.ts`*
