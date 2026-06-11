# CashManagement 架構準則（.NET / Blazor 版）

> 本專案是 `suspense-app(暫停更新的舊版)`（Next.js + TypeScript 原型）的 C# 重建版。
> 原型已驗證需求與流程；本版為**正式開發主線**，由公司 C# 團隊與 AI 共同維護。
> 新增或修改功能前，務必先讀本文件。

## 1. 技術棧

| 層 | 技術 | 備註 |
|---|---|---|
| UI | Blazor Server（.NET 8, Interactive Server） | 內部後台系統，不需另開 API 層 |
| 樣式 | Tailwind（Play CDN） | **開發/原型用**；正式部署改預編譯 Tailwind 或換 MudBlazor |
| 業務 | C# Services（`Services/`） | 業務規則唯一所在地 |
| 資料 | EF Core 8 | DbContext = Repository + Unit of Work |
| DB | 開發：SQLite（`App_Data/cash.db`）／正式：**SQL Server** | 見 §5 |

## 2. 分層（與原型四層的對應）

```
Components/Pages/*.razor   ← UI：畫面狀態與互動，呼叫 service，顯示結果
        ↓
Services/*.cs              ← 業務規則、權限、交易（BeginTransaction）；拋 BusinessException
        ↓
Data/AppDbContext          ← EF Core：查詢以 LINQ 寫在 service；DbContext 本身即資料存取層
        ↓
Domain/*.cs                ← 領域型別/常數/例外（不依賴其他層）
```

原型的 route→service→repository→db 四層，在 .NET 對應為三層：
**EF Core 的 DbContext 已實作 Repository/UoW 模式，不另疊 repository 層**；
LINQ 查詢視同原 repository 的 SQL，集中寫在 service、不寫進 .razor。

### 鐵律
- `.razor` 內**不得**出現 LINQ-to-DB 查詢或業務 if；只能呼叫 service。
- service 拋 `BusinessException(訊息)` 表業務規則違反；UI 捕捉後以 Toast 顯示。
- 多表寫入一律 `db.Database.BeginTransaction()`。
- 樂觀鎖：`Version` 欄位，更新走 `ExecuteUpdate(... Where Version == old)`，影響 0 筆＝衝突。
- **權限判斷收斂於 `PermissionService.GetAccessibleAccountCodes`**（null=主管不過濾、[]=無權）。
  未來導入 RBAC（ID→GROUP→GROUP authority）只改此處。
- 業務日期一律 `string "yyyy-MM-dd"`；金額一律 `decimal`。
- 先有第二個用例再抽象。

## 3. 目錄

```
CashManagement/
├─ Program.cs              # DI 註冊、DB 初始化（EnsureCreated + DbSeeder）
├─ Domain/                 # Enums.cs（業務常數/BusinessException）、Ingest.cs（轉檔型別）
├─ Data/                   # Entities.cs（12 實體）、AppDbContext.cs（唯一鍵）、DbSeeder.cs（demo seed）
├─ Services/
│   ├─ CurrentUserState.cs # 目前操作者（scoped/circuit；demo 切換器，正式版改登入）
│   ├─ PermissionService.cs# 權限唯一接縫
│   ├─ SuspenseService.cs  # FUN2.1.2：查詢/新增/儲存/刪除/確認/取消（傳票+通報）
│   ├─ BalanceService.cs   # FUN2.1.1：兩餘額並陳/人工調整/全批覆核
│   ├─ IngestService.cs    # FUN2.1.1：轉檔三段式 Parse→Map→Validate+Write、試轉預覽
│   ├─ BankFormatService.cs
│   ├─ MasterDataService.cs# 帳號維護權限（主辦/代理指派；主從式自訂頁）
│   ├─ Master/             # 基本資料維護框架：MasterDef（欄位 metadata）＋ MasterMaintenanceService
│   │                      #（泛型 CRUD/篩選/停用/匯出；見 ../SD_MASTER_FRAMEWORK.md）
│   └─ Parsing/            # DelimitedParser、MappingHelper（民國年/金額）、ParsedProfile、ParserRegistry
├─ Components/
│   ├─ Layout/MainLayout.razor   # 側欄+頂部列+操作者切換
│   ├─ Shared/                   # PageHeader/Toast/Modal/EmptyState/StatCard/MasterPage（框架共用畫面）
│   └─ Pages/                    # Suspense / Balances / MasterAccounts / MasterUsers / MasterPermissions / BankFormats
└─ App_Data/cash.db            # 開發用 SQLite（git 忽略）
```

### 基本資料維護
新增一個基本資料維護畫面＝實體（掛 `IAuditable`/`ISoftDelete`）＋一份 `MasterDef` 欄位定義＋`<MasterPage>` 一行，
查詢/篩選/CRUD/停用/匯出 CSV 全自動具備；規格與 SOP 見 `../SD_MASTER_FRAMEWORK.md`。
維護動作限 MANAGER；被參照的主檔不可刪除、只能停用（停用帳號/使用者自動排除於暫收、轉檔、權限判斷之外）。

## 4. 與原型 (suspense-app) 的關係

- 原型保留於 `../suspense-app(暫停更新的舊版)`，定位為**已驗證需求的可運行規格**；新功能一律做在本專案，原型**不再更新**。
- 設計文件沿用 repo 根目錄：`FUN2.1.1_轉檔架構設計.md`、`SD_DB_DESIGN.md`、`FUN2.1.1_測試文件.md`。
- 資料表邏輯模型 1:1 移植（命名改 .NET 慣例 PascalCase，唯一鍵全數保留）。

## 5. 資料庫切換（SQLite → SQL Server）

1. `dotnet add package Microsoft.EntityFrameworkCore.SqlServer`
2. `appsettings.json` 的 `ConnectionStrings:Default` 填入 SQL Server 連線字串
3. `Program.cs` 的 `UseSqlite(connStr)` 改 `UseSqlServer(connStr)`
4. 正式環境改用 **EF Migrations**（`dotnet ef migrations add Init`）取代 `EnsureCreated`，
   並把 `DbSeeder` 的 demo 資料改為正式基本資料載入。

程式中查詢一律 LINQ、無 provider 專屬 SQL，切換不需改業務程式。

## 6. 已知限制（與原型相同，Phase 3 待辦）

- 解析引擎僅 `DELIMITED`；`FIXED_WIDTH`/`EXCEL` 未實作（`ParserRegistry` 預留掛點）
- 編碼僅 UTF-8；Big5 需 `System.Text.Encoding.CodePages`
- `LedgerBalances` 由 seed 模擬；正式須由結帳（URS2.7）流程供應
- 登入為「操作者切換器」替身（`CurrentUserState`）；正式版接登入＋RBAC（URS2.90.500）
- Tailwind Play CDN 需網路；離線/正式環境改預編譯

## 7. 開發指令

```bash
dotnet run                 # 啟動（預設 launchSettings 連接埠）
dotnet run --urls http://localhost:5180
dotnet build               # 建置
```
