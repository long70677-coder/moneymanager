# 資料庫備份（開發用）

本資料夾提供開發用 SQLite 種子資料庫，讓**剛 clone 專案的人可以直接還原一份含示範資料的資料庫**，不必等系統自動建檔。

## 內容

| 檔案 | 說明 |
|------|------|
| `cash.seed.db` | 開發用 SQLite 種子資料庫（最新 schema＋示範資料：銀行、對照碼、幣別、匯率、假日、銀行帳號等基本資料）|
| `還原資料庫.bat` | **雙擊即可還原**，純 `copy` 實作，不需要安裝任何 PowerShell（推薦給公司電腦）|
| `還原資料庫.ps1` | PowerShell 版還原腳本，將 `cash.seed.db` 複製到 `CashManagement/App_Data/cash.db` |

## 還原步驟

clone 專案後，擇一執行（三種任選，效果相同）：

**方式一：雙擊 bat（最簡單，免 PowerShell）**
直接在檔案總管雙擊 `還原資料庫.bat`。若已有 `cash.db`，會先備份成 `cash.db.bak` 再覆蓋。

**方式二：Windows PowerShell 5.1（內建，不需安裝 PowerShell 7）**
於本資料夾執行——注意是 `powershell` 不是 `pwsh`：
```powershell
powershell -ExecutionPolicy Bypass -File .\還原資料庫.ps1
```

**方式三：PowerShell 7（pwsh）**
```powershell
pwsh -ExecutionPolicy Bypass -File .\還原資料庫.ps1
```

> .ps1 版若系統已有 `cash.db`，會先備份成 `cash.db.bak-時間戳` 再覆蓋；加 `-Force` 可略過備份直接覆蓋。

還原後到 `CashManagement` 目錄啟動系統：
```
dotnet run --launch-profile http
```

## 注意事項

- `CashManagement/App_Data/` 已列入 `.gitignore`，執行階段產生的 `cash.db` 不會進版控；唯有本資料夾的 `cash.seed.db` 是**刻意納管**的種子檔。
- 還原前請先**關閉執行中的系統**，否則資料庫被鎖定會還原失敗。
- 此為**開發階段**用法。正式環境改用 SQL Server，schema 以 EF Core Migrations 管理，不使用此種子檔。
- 不用還原也可以：直接 `dotnet run` 時，系統會以 `EnsureCreated`＋`DbSeeder` 自動建立並填入相同的示範資料。本備份是給「想要與團隊完全一致的資料快照」或「想跳過建檔」的情境。

## 更新種子檔

當 schema 或示範資料有重大調整、想更新團隊共用的快照時，將最新的 dev DB 複製覆蓋本檔即可：

```powershell
Copy-Item ..\CashManagement\App_Data\cash.db .\cash.seed.db -Force
```

然後 commit `cash.seed.db`。
