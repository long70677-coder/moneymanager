# moneymanager — 公司銀行存款資金管理系統

## 資料夾定位

| 資料夾 | 定位 | 狀態 |
|---|---|---|
| **`CashManagement/`** | **正式版**：Blazor Server + .NET 8 + EF Core（開發用 SQLite，正式環境換 SQL Server） | ✅ 開發主線，新功能一律做在這裡 |
| `suspense-app(暫停更新的舊版)/` | Next.js + TypeScript 原型，已驗證需求的「可運行規格」，移植對照用 | 🔒 暫停更新，不再開發 |

## 開始開發前必讀

1. `CashManagement/ARCHITECTURE.md` — 分層架構、鐵律、設計系統、SQL Server 切換步驟
2. `FUN2.1.1_轉檔架構設計.md`、`SD_DB_DESIGN.md` — 設計文件（兩版本共用）
3. `FUN2.1.1_測試文件.md` — 測試案例（20 案＋端到端走查）

## 啟動正式版

```bash
cd CashManagement
dotnet run --urls http://localhost:5180
```
