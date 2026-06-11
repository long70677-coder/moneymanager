# moneymanager — 公司銀行存款資金管理系統

## 資料夾定位

| 資料夾 | 定位 | 狀態 |
|---|---|---|
| **`CashManagement/`** | **正式版**：Blazor Server + .NET 8 + EF Core（開發用 SQLite，正式環境換 SQL Server） | ✅ 開發主線，新功能一律做在這裡 |
| `suspense-app(暫停更新的舊版)/` | Next.js + TypeScript 原型，已驗證需求的「可運行規格」，移植對照用 | 🔒 暫停更新，不再開發 |

## 開始開發前必讀

1. `CashManagement/ARCHITECTURE.md` — 分層架構、鐵律、設計系統、SQL Server 切換步驟
2. `docs/FUN/FUN2.1.1_轉檔架構設計.md`、`docs/SD/SD_DB_DESIGN.md` — 設計文件（兩版本共用）
3. `docs/FUN/FUN2.1.1_測試文件.md` — 測試案例（20 案＋端到端走查）

## 文件結構

| 路徑 | 內容 |
|---|---|
| `docs/URS/` | 使用者需求規格（URS2.4.1 投資款收付、URS2.90.202 銀行帳號基本資料） |
| `docs/SD/` | 系統設計（SD_DB_DESIGN 資料表、SD_MASTER_FRAMEWORK 主檔框架） |
| `docs/FUN/` | 功能設計與測試（FUN2.1.1 轉檔架構設計、測試文件） |
| `docs/流程圖/` | 事務／工作流程圖 |
| `funcList.md` | 全系統功能清單（FUN 階層） |
| `開發索引.md` | 功能 ↔ 檔案／函式對照（開場自動顯示） |

## 啟動正式版

```bash
cd CashManagement
dotnet run --urls http://localhost:5180
```
