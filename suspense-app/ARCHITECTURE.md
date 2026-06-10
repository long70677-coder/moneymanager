# 架構準則 ARCHITECTURE

> 本文件是「銀行存款資金管理系統」程式碼的**唯一架構依據**。
> **人與 AI 共同維護，新增或修改功能前必讀，所有程式碼一律遵循本文件的分層與慣例。**
> 與本文件衝突的舊寫法視為待重構債務，不可作為新程式的範本。

---

## 0. TL;DR（最重要的五條）

1. **分四層**：`route`（HTTP 邊界）→ `service`（業務規則）→ `repository`（SQL）→ `db`（連線）。**不可跨層**：route 不直接寫 SQL，repository 不含業務判斷。
2. **業務規則只寫一次**：日結、通報鎖定、混幣、權限等檢查一律收在 service，不在多支 route 重複貼 SQL。
3. **權限檢查一律在 service 層**，透過 `permission.service`，不在 route 內各寫一段。
4. **錯誤用 `BusinessError` 丟出**，由 route 統一轉成 HTTP 狀態碼，service/repository 內不出現 `NextResponse`。
5. **先有第二個用例再抽象**。只有一個模組時不要預先做泛型／共用框架。

---

## 1. 技術棧與限制（不可違反）

| 項目 | 內容 |
|------|------|
| 框架 | Next.js App Router（**此版本有 breaking changes，寫 code 前先讀 `node_modules/next/dist/docs/`，見 AGENTS.md**） |
| 語言 | TypeScript（`strict`） |
| DB | better-sqlite3（**同步 API**，WAL，開啟 foreign_keys） |
| 樣式 | Tailwind CSS（utility class，沿用既有色票） |

- better-sqlite3 是**同步**的，不要對 DB 呼叫加 `await`，也不需要連線池／DI 容器。
- DB 連線是單例（`lib/db.ts` 的 `getDb()`），不要在別處 `new Database()`。

---

## 2. 分層架構

```
HTTP 請求
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ app/api/**/route.ts        【HTTP 邊界層】                    │
│  · 解析 request（query / body）                              │
│  · 呼叫 service                                              │
│  · 把結果包成 NextResponse；把 BusinessError 轉 HTTP 狀態碼   │
│  · 不含任何 SQL、不含業務 if 判斷                            │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ services/*.service.ts       【業務規則層】                   │
│  · 所有業務規則與流程（日結檢查、混幣檢查、取號、算金額…）   │
│  · 權限判斷（呼叫 permission.service）                       │
│  · 開啟 db.transaction() 協調多個 repository                 │
│  · 規則不通過時 throw new BusinessError(...)                 │
│  · 不認識 HTTP（沒有 Request / NextResponse）                │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ repositories/*.repo.ts      【資料存取層】                   │
│  · 唯一可以寫 SQL 的地方                                      │
│  · 一張表（或一個聚合）一個 repository                       │
│  · 只做存取，不做業務判斷、不丟 BusinessError                │
└─────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/db.ts                   【連線層】                       │
│  · getDb() 單例、schema 初始化、seed                         │
└─────────────────────────────────────────────────────────────┘

domain/  【領域型別與常數】 ← 各層都可 import，但 domain 不 import 其他層
```

**依賴方向只能由上往下**：route → service → repository → db。
下層**不可**反向 import 上層；同層之間：service 可呼叫 service，repository 不呼叫 repository（需要跨表時由 service 協調）。

---

## 3. 目標目錄結構

```
src/
├── app/
│   ├── api/                     # 只放 route.ts（HTTP 邊界）
│   │   ├── suspense-transactions/route.ts
│   │   └── ...
│   ├── <page>/page.tsx          # 前端頁面（Client Component）
│   └── layout.tsx
├── components/                  # 可重用 React 元件
├── services/                    # ★ 業務規則層
│   ├── suspense.service.ts
│   ├── permission.service.ts
│   └── ...
├── repositories/                # ★ 資料存取層（SQL 集中地）
│   ├── suspense.repo.ts
│   ├── batch.repo.ts
│   ├── account.repo.ts
│   └── ...
├── domain/                      # ★ 型別、規則常數、錯誤型別
│   ├── types.ts                 # 由現 lib/types.ts 移入
│   ├── rules.ts                 # 旗標、會計科目對照、狀態機常數
│   └── errors.ts                # BusinessError 等
└── lib/
    └── db.ts                    # 連線層（維持現狀）
```

> `services/`、`repositories/`、`domain/` 為**目標結構**，隨重構逐步建立（見 §9 現況）。
> 新功能一律照此結構放；**不要**再把 SQL 寫進 `route.ts`。

---

## 4. 各層的規則

### 4.1 Route（`app/api/**/route.ts`）
- 只做三件事：**取參數 → 呼叫 service → 回應**。
- 標準骨架：
  ```ts
  export async function POST(req: NextRequest) {
    const body = await req.json();
    try {
      const result = suspenseService.createBatch({ ...body });
      return NextResponse.json(result);
    } catch (e) {
      return toHttpError(e); // domain/errors.ts 提供
    }
  }
  ```
- **禁止**：在 route 內 `db.prepare(...)`、寫業務 `if`、各自組 `NextResponse.json({error}, {status})`。

### 4.2 Service（`services/*.service.ts`）
- 一個業務模組一個 service 檔。函式命名用動詞：`createBatch`、`confirmBatch`、`cancelConfirm`。
- 規則檢查抽成可重用的 assert 函式，**讓多個流程共用**：
  ```ts
  function assertNotDayClosed(date, currency) { if (...) throw new BusinessError("已日結，不可操作"); }
  ```
- 多表寫入一律包在 `getDb().transaction(() => { ... })()` 內。
- **權限**：呼叫 `permissionService.getAccessibleAccountCodes(userId, refDate)` / `assertBatchOwnership(...)`，不在 service 各自查 SQL。
- service **不認識 HTTP**：不 import `next/server`，不碰 `NextRequest`。

### 4.3 Repository（`repositories/*.repo.ts`）
- **唯一允許寫 SQL 的地方**。每個查詢包成具名方法：`findByBatchNo`、`insertMany`、`updateAmount`。
- 只回傳資料或受影響筆數，**不丟 BusinessError、不做業務判斷**（「能不能刪」是 service 的事，repository 只負責「刪」）。
- 共用 CRUD 的抽象（`BaseRepository<T>`）**等第二張表要做時再抽**，不要提早。

### 4.4 Domain（`domain/`）
- `types.ts`：跨層共用的 interface（如 `SuspenseTransaction`）。
- `rules.ts`：寫死的業務常數——會計科目對照（1131/2141…）、暫收類型、旗標語意、狀態機允許的轉換。**魔術字串/數字一律集中在此**。
- `errors.ts`：`BusinessError`（帶 HTTP 狀態碼）與 `toHttpError()`。
- domain **不 import 其他層**。

---

## 5. 錯誤處理（統一約定）

```ts
// domain/errors.ts
export class BusinessError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function toHttpError(e: unknown) {
  if (e instanceof BusinessError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "系統錯誤" }, { status: 500 });
}
```

- 業務規則不通過 → `throw new BusinessError("訊息", 400|403)`。
- 權限不足 → `throw new BusinessError("...", 403)`。
- route 一律 `catch` 後交給 `toHttpError`。
- **錯誤訊息用使用者看得懂的中文**，沿用現有用語（例：「已日結，不得確認」）。

---

## 6. 三個跨層約定（務必一致）

| 議題 | 規定位置 | 說明 |
|------|----------|------|
| **權限** | `permission.service` | 主管 = 全部（回 `null`）；經辦 = 有效期內可維護帳號。所有寫入路徑都要過。 |
| **交易一致性** | service 層開 transaction | 任何「多表寫入」或「先檢查後寫入」都必須在同一個 `db.transaction()` 內。 |
| **樂觀鎖** | repository 的 UPDATE 帶 `version` | 可被並發修改的表（`suspense_transactions`、`batch_confirmations`）更新時 `WHERE version = ?` 並 `version + 1`；service 依 `changes` 判斷是否衝突。 |

---

## 7. 新增功能的標準流程（Checklist）

新增一個業務功能時，由下往上依序做：

1. **domain**：在 `types.ts` 補型別、`rules.ts` 補常數。
2. **migration / schema**：需要新表或欄位時改 `lib/db.ts` 的 `initSchema`，並更新 `SD_DB_DESIGN.md`。
3. **repository**：新增/擴充 `*.repo.ts`，把 SQL 寫在這裡。
4. **service**：寫業務規則與流程，呼叫 repository，套權限，開 transaction，違規 throw `BusinessError`。
5. **route**：薄薄一層，取參數 → 呼叫 service → `toHttpError`。
6. **前端**：頁面/元件呼叫該 API。
7. **測試**：對 service 寫單元測試（脫離 HTTP，直接帶資料測規則）。
8. **文件**：若改了資料表 → 更新 `SD_DB_DESIGN.md`；若改了架構慣例 → 更新本檔。

> 新增「基本資料」類功能（幣別、會計科目、銀行…）時：第二張表開始可考慮抽 `BaseRepository<T>` 與共用維護頁設定，避免每張表複製貼上。

---

## 8. 反模式（Don't）

- ❌ 在 `route.ts` 寫 `db.prepare(...)` 或業務 `if`。
- ❌ 同一條規則（如「已日結不可改」）在多支 route 各寫一遍 SQL。
- ❌ service 內 `import { NextResponse } from "next/server"`。
- ❌ repository 內判斷「能不能做」並丟錯。
- ❌ 只有一個用例就先抽泛型/共用框架（過早抽象）。
- ❌ 魔術字串/數字散落各處（會計科目、狀態值要進 `domain/rules.ts`）。
- ❌ 繞過 `getDb()` 自行建立 DB 連線。

---

## 9. 現況 vs 目標（重構進度）

| 區塊 | 現況 | 目標 | 狀態 |
|------|------|------|------|
| route | SQL + 規則 + 權限混在 route 內 | route 只當 HTTP 邊界 | ⬜ 待重構 |
| service 層 | 不存在 | 業務規則集中 | ⬜ 未建立 |
| repository 層 | 不存在（SQL 散在 route） | SQL 集中 | ⬜ 未建立 |
| domain | `lib/types.ts` | `domain/{types,rules,errors}` | ⬜ 部分 |
| 連線層 | `lib/db.ts` 單例 | 維持 | ✅ 符合 |
| 權限函式 | `getAccessibleAccountCodes` in db.ts | 移到 `permission.service` | ⬜ 待移 |

**重構優先序（低風險先做）**：
1. 抽 `repositories/`（搬 SQL，route 行為不變）。
2. 抽 `services/`（收斂重複規則，三支暫收 route 改呼叫）。
3. 建 `domain/errors.ts` + 統一錯誤處理。
4. 第二個基本資料表出現時，再抽 `BaseRepository<T>`。

> ⚠️ 重構採**逐步、行為不變**原則：每步完成後系統功能與現在一致，再進下一步。不要一次大改。

---

## 10. OOP 使用準則（何時用 class）

TypeScript 不強制 OOP，本專案的取捨原則：

- ✅ **用 class**：有共用行為要靠繼承收斂時 → `BaseRepository<T>` 及其子類。
- ✅ **用函式模組**：無狀態的業務規則、純運算（service 多數情況、domain 規則）→ 函式更好測、更直觀。
- ❌ 不要把無狀態邏輯硬包成 class 只為了「看起來物件導向」。

**判準一句話：有共用狀態/行為要繼承 → class；只是一組輸入輸出 → 函式。**

---

_最後更新：2026-06-10。修改架構慣例時請同步更新本檔與 §9 進度表。_
