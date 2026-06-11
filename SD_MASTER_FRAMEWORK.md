# SD 設計文件 — 基本資料維護共用框架（Master Maintenance Framework）

> 目的：系統將持續新增基本資料檔，每個主檔都需要「查詢、新增、修改、刪除、欄位篩選、匯出」。
> 本框架把這些行為做成**一次實作、宣告式套用**：新增一個主檔維護畫面 = 寫一份欄位定義（metadata），
> 不再複製貼上頁面。
>
> 對應程式：`CashManagement/Services/Master/`（框架核心）、`CashManagement/Components/Shared/MasterPage.razor`（共用畫面）。

---

## 一、設計目標與範圍

| # | 需求 | 框架的回應 |
|---|------|-----------|
| 1 | 每個主檔都要 CRUD | 泛型服務 `MasterMaintenanceService` 統一實作，主檔僅掛驗證鉤子 |
| 2 | 欄位都要可篩選 | 欄位定義宣告 `Filterable`，框架依欄位型別自動長出篩選列（文字含查/下拉/是否/日期區間），並轉成 **EF Core `IQueryable` 條件**（DB 端過濾，非記憶體過濾） |
| 3 | 資料都要可匯出 | 與列表同一份欄位定義產出 **Excel（.xlsx，ClosedXML）**：標題列凍結＋粗體底色、欄寬自動、數值/日期以原生型別輸出；內容＝**目前篩選後**結果 |
| 4 | 主檔會一直增加 | 新主檔 = 實體類別 + 一份 `MasterDef` 欄位定義 + 一頁 `<MasterPage>`（約 30–60 行） |
| 5 | 主檔被交易資料參照 | 內建「**有參照只能停用、不能刪除**」規則（軟刪除 `IsActive`），刪除前鉤子檢查 |
| 6 | 維護要受權限控管 | 維護動作（新增/修改/刪除/停用）限 **MANAGER（主管）**；STAFF（經辦）可查詢、篩選、匯出 |

**本期套用對象（已實作）：**

| 頁面 | 路由 | 主檔 | 套用方式 |
|------|------|------|----------|
| 銀行帳號基本資料 | `/master/accounts`（`/master` 同頁） | `bank_accounts` | `MasterPage` 全宣告式 |
| 使用者基本資料 | `/master/users` | `users` | `MasterPage` 全宣告式 |
| 帳號維護權限 | `/master/permissions` | `account_managers` | **自訂版面**＋共用元件（主從式，見 §7） |
| 幣別基本資料 | `/master/currencies` | `currencies` | `MasterPage` 全宣告式（軟刪除） |
| 匯率基本資料 | `/master/rates` | `exchange_rates` | `MasterPage` 全宣告式（**動態下拉**：幣別選項於頁面 OnInitialized 由幣別主檔組入 def，示範選項不必寫死） |
| 假日基本資料 | `/master/holidays` | `holidays` | `MasterPage` 全宣告式（最小用例：兩個欄位） |

**下游接線（基本資料生效點）：**
- 匯率：`SuspenseService.CreateBatch` 立暫收時取「暫收日期（含）以前最近一筆」，查無匯率即擋下（台幣/保單帳戶恆為 1）；交易留存匯率快照。
- 假日：`PrevBusinessDay`／`NextBusinessDay` 排除週六日＋假日檔（T-1 取前一營業日、轉檔次日推算）。
- 幣別：暫收（/suspense）與餘額轉檔（/balances）的幣別下拉、幣別名稱、金額小數位均由幣別主檔供應，新增幣別不再改程式。

> 原唯讀頁 `/master`（Master.razor）由上述三頁取代並移除。
> 既有「銀行格式設定 `/bank-formats`」為先前實作的手刻維護頁，本期**不**強制改寫；後續若調整可遷移至框架。

---

## 二、架構分層

```
Components/Pages/Master*.razor      ← 各主檔頁：一份 MasterDef 欄位定義 + <MasterPage>
        │
Components/Shared/MasterPage.razor  ← 共用畫面元件（泛型 TEntity）
        │   篩選列／表格＋排序＋分頁／新增·修改 Modal／刪除·停用確認／匯出按鈕
        │
Services/Master/MasterMaintenanceService.cs   ← 泛型服務（無狀態 singleton）
        │   Query（組 IQueryable 篩選）／Create／Update／Delete／SetActive／ExportCsv
        │
Services/Master/MasterDef.cs        ← metadata 型別（MasterDef / MasterField / FieldKind）
        │
Data/Entities.cs                    ← 實體 + IAuditable / ISoftDelete 介面
```

依賴方向單向往下；頁面不直接碰 `DbContext`。

---

## 三、欄位定義（metadata）規格

### 3.1 `FieldKind`（欄位型別 → 決定篩選控制項與表單控制項）

| Kind | 表單控制項 | 篩選控制項 | 篩選語意 |
|------|-----------|-----------|---------|
| `Text` | 文字框 | 文字框 | 包含（LIKE %v%） |
| `Number` | 數字框 | 文字框 | 等值 |
| `Bool` | 核取方塊 | 下拉（全部/是/否） | 等值 |
| `Select` | 下拉（Options） | 下拉（全部+Options） | 等值 |
| `Date` | 日期框（存 `yyyy-MM-dd` 字串） | 起迄兩個日期框 | 區間（字串比較） |

### 3.2 `MasterField<TEntity>` 主要屬性

| 屬性 | 意義 |
|------|------|
| `Key` / `Label` | 欄位識別（表單/匯出）／中文標題 |
| `Kind` | 欄位型別（上表） |
| `Member` | `Expression<Func<TEntity, object?>>`，**一個表達式同時驅動**：列表取值、篩選條件（rebase 進 IQueryable）、表單寫回（反射 setter）、排序 |
| `Get` | 計算欄位用（僅顯示；不可篩選/編輯） |
| `Required` | 必填（新增/修改時檢核） |
| `InUniqueKey` | 業務唯一鍵成員（可多欄組合；框架自動查重） |
| `Editable` / `EditableOnCreate` | 修改/新增時可否輸入（例：帳號短碼建立後鎖定） |
| `ShowInList` / `ShowInForm` / `Filterable` | 出現在列表／表單／篩選列 |
| `Options` | Select 選項（值/中文標籤），列表顯示自動帶標籤 pill |
| `Mono` | 列表以等寬字呈現（代碼/帳號類欄位） |
| `Placeholder` / `FormHint` | 表單提示 |

### 3.3 `MasterDef<TEntity>` 主要屬性

| 屬性 | 意義 |
|------|------|
| `Title` / `Icon` / `ExportName` | 標題、Material 圖示、匯出檔名前綴 |
| `Fields` | 欄位定義清單 |
| `UniqueKeyMessage` | 唯一鍵衝突時的訊息（預設自動組） |
| `Validate(db, entity, isNew)` | 業務驗證鉤子（超出必填/唯一鍵的規則；丟 `BusinessException`） |
| `DeleteBlockReason(db, entity)` | 刪除前檢查：回傳 null=可實體刪除；回傳訊息=阻擋並提示改用停用 |

---

## 四、泛型服務行為規格

所有維護方法第一步檢核 `actor.Role == MANAGER`，否則丟 `BusinessException("僅主管可維護基本資料")`。

| 方法 | 行為 |
|------|------|
| `Query(def, filters)` | 以 `db.Set<TEntity>()` 起手，逐一把有值的篩選轉成 expression 條件（§3.1 語意）後 `ToList()`；**過濾在 DB 端執行**，將來換 SQL Server 行為不變 |
| `Create(def, entity, actor)` | 必填檢核 → 唯一鍵查重 → `Validate` 鉤子 → 蓋審計欄位（IAuditable）→ 寫入 |
| `Update(def, entity, actor)` | 同上，但唯一鍵查重排除自身；**只回寫 `Editable` 欄位**，非可編輯欄位以資料庫現值為準 |
| `Delete(def, id, actor)` | `DeleteBlockReason` 有訊息 → 丟 `BusinessException`（訊息含「請改用停用」）；無 → 實體刪除 |
| `SetActive(def, id, active, actor)` | 軟刪除開關（限 `ISoftDelete` 實體）；切換後仍跑 `Validate` 鉤子（例：不可停用最後一位主管） |
| `ExportExcel(def, rows)` | `ShowInList` 欄位 → .xlsx；Bool 輸出 是/否、Select 輸出中文標籤；數值/日期欄以原生型別輸出（Excel 內可直接加總/排序） |

匯出下載：服務回傳 byte[] → 頁面轉 base64 → JS `appDownload()`（`App.razor` 內建小函式）觸發瀏覽器下載，檔名 `{ExportName}_{yyyyMMdd_HHmmss}.xlsx`。自訂頁共用 `MasterMaintenanceService.BuildWorkbook(表名, 表頭, 列)`。

---

## 五、共通資料規則（實體介面）

### 5.1 `IAuditable` — 審計欄位（框架自動蓋）

`CreatedBy / CreatedAt / UpdatedBy / UpdatedAt`：新增時四欄齊蓋；修改/停用時蓋 Updated*。值取目前操作者 `UserName`。

### 5.2 `ISoftDelete` — 停用旗標

`IsActive`（預設 true）。規則：

- 主檔資料**被任何交易/設定參照後，不可實體刪除**，只能停用（`DeleteBlockReason` 把關）。
- 停用的影響（本期已落地）：
  - 停用的**銀行帳號**：不再出現在存摺餘額維護（BalanceService）、暫收立帳（SuspenseService）、轉檔檔名比對（IngestService）。
  - 停用的**使用者**：操作者切換器不再列出（CurrentUserState）、權限判斷視同無權限（PermissionService 回空集合）。
- 列表預設**顯示全部**（含停用，停用列以灰階＋「停用」標示），可用「啟用」欄位篩選。

### 5.3 本期實體調整（詳見 SD_DB_DESIGN.md 同步更新）

| 實體 | 新增欄位 | 介面 |
|------|---------|------|
| `BankAccount` | `IsActive`、`CreatedBy`、`UpdatedBy` | IAuditable + ISoftDelete |
| `User` | `IsActive`、`CreatedBy`、`UpdatedBy`、`UpdatedAt` | IAuditable + ISoftDelete |
| `AccountManager` | `CreatedBy`、`UpdatedBy`、`UpdatedAt` | IAuditable（指派紀錄＝關聯資料，允許實體刪除，不做軟刪除） |

> ⚠️ 開發資料庫（App_Data/cash.db，EnsureCreated 模式）因 schema 變更需重建：舊檔已改名備份為 `cash.db.bak-*`，啟動時自動重建＋seed。正式環境屆時走 EF Migrations，不受此影響。

---

## 六、各主檔規格

### 6.1 銀行帳號基本資料（/master/accounts）

- 唯一鍵：`AccountCode`（建立後**不可修改**，避免孤兒參照）。
- 必填：帳號短碼、完整帳號、銀行代碼、帳戶名稱。
- 篩選：短碼/完整帳號/銀行代碼/名稱/用途（文字含查）、幣別屬性（下拉）、暫收/保單/啟用（是否）。
- 刪除：被存摺餘額、暫收交易或帳號維護權限參照 → 阻擋，改停用。

### 6.2 使用者基本資料（/master/users）

- 唯一鍵：`UserCode`（建立後不可修改）。必填：代碼、姓名。角色下拉（經辦/主管）。
- 防鎖死規則（Validate 鉤子）：**系統至少保留一位「啟用中的主管」**——把最後一位主管改成經辦、或停用最後一位主管，一律阻擋（否則再也沒有人能維護基本資料）。
- 刪除：被帳號維護權限參照 → 阻擋，改停用。

### 6.3 帳號維護權限（/master/permissions）— 主從式自訂頁

不硬塞泛型頁（顯示欄位來自 users × bank_accounts join），但沿用共用元件（app-card、Modal、Toast、EmptyState）與相同的操作慣例；服務方法放 `MasterDataService`。

- 一筆 = 使用者 × 帳號 × 類型（主辦 PRIMARY／代理 AGENT），唯一鍵三欄組合（DB 已有 unique index，服務先查重給友善訊息）。
- 代理可填有效期間（起迄皆選填；都填時起 ≤ 迄）；**主辦不適用期間**（儲存時清空）。
- 下拉只列**啟用中**的使用者與帳號；主管角色不需指派（不過濾擋住，但 UI 提示主管本來就不受限）。
- 篩選：使用者、帳號、類型；匯出沿用框架 Excel 工具（`BuildWorkbook`）。
- 刪除：指派紀錄無下游參照，允許實體刪除（需確認）。

---

## 七、權限模型

| 角色 | 查詢/篩選/匯出 | 新增/修改/刪除/停用 |
|------|---------------|---------------------|
| STAFF 經辦 | ✅ | ❌（按鈕不顯示；服務端亦檢核——雙層防護） |
| MANAGER 主管 | ✅ | ✅ |

權限判斷沿用 `CurrentUserState.CurrentUser.Role`（demo 切換器；正式版接登入後不需改框架）。

---

## 八、新增一個基本資料維護畫面的 SOP

1. `Data/Entities.cs` 加實體（掛 `IAuditable`；會被參照的主檔加 `ISoftDelete`），`AppDbContext` 加 DbSet 與索引。
2. 新增 `Components/Pages/MasterXxx.razor`：
   ```razor
   @page "/master/xxx"
   <MasterPage TEntity="Xxx" Def="@def" />
   @code {
       private static readonly MasterDef<Xxx> def = new() {
           Title = "…", Icon = "…", ExportName = "…",
           Fields = [ new() { Key=…, Label=…, Member = e => e.Prop, … }, … ],
           DeleteBlockReason = (db, e) => …,
       };
   }
   ```
3. `MainLayout.razor` 側欄加一個 NavItem。

完成。查詢、篩選、新增、修改、刪除/停用、匯出全部自動具備。

---

## 九、待確認議題（業務）

1. **審計軌跡深度**：目前留「最後異動人/時」；若稽核要求逐筆異動歷程（who changed what），需另建 audit log 表——框架已集中寫入點，屆時只改服務一處。
2. **帳號維護權限是否也要軟刪除**：本期視為關聯資料採實體刪除；若日後要保留指派歷史，改掛 `ISoftDelete` 即可。
3. ~~**匯出格式**：目前 CSV；若要求含格式的 Excel，再引入 ClosedXML 替換。~~ ✅ 已決議並完成：改為 Excel（.xlsx，ClosedXML 0.105），凍結標題列、欄寬自動、數值原生型別。
4. **經辦是否可匯出**：本期開放（資料僅主檔非交易機敏）；若資安要求收斂，改一行權限檢核。
5. **銀行格式設定頁遷移**：`/bank-formats` 欄位含 JSON 對應編輯器，屬複雜表單，建議維持手刻；是否遷移由後續決定。
