namespace CashManagement.Data;

// 業務日期一律以 "yyyy-MM-dd" 字串儲存（避免時區問題、利於跨 provider 比較）。
// 金額一律 decimal。

/// <summary>審計欄位（基本資料維護框架自動蓋值）。</summary>
public interface IAuditable
{
    string CreatedBy { get; set; }
    DateTime CreatedAt { get; set; }
    string UpdatedBy { get; set; }
    DateTime UpdatedAt { get; set; }
}

/// <summary>軟刪除：被交易資料參照的主檔不可實體刪除，以停用取代。</summary>
public interface ISoftDelete
{
    bool IsActive { get; set; }
}

/// <summary>銀行基本資料（URS2.90.201 先行最小版：供帳號頁下拉與分行簡稱）。</summary>
public class Bank : IAuditable, ISoftDelete
{
    public int Id { get; set; }
    public string HeadOfficeCode { get; set; } = "";    // 銀行總行代號
    public string BankCode { get; set; } = "";          // 銀行代碼（unique，含分行）
    public string ShortName { get; set; } = "";         // 銀行簡稱
    public bool IsActive { get; set; } = true;
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>對照碼檔（URS 各下拉選單來源；Category+Code 唯一）。</summary>
public class CodeMapEntry : IAuditable, ISoftDelete
{
    public int Id { get; set; }
    public string Category { get; set; } = "";          // 類別：DEPOSIT_TYPE/LEDGER_TYPE/CURRENCY_TYPE/FX_ACCOUNT_TYPE/INTEREST_PAYOUT/INTEREST_DAYS
    public string Code { get; set; } = "";              // 代碼（"1"、"2"…）
    public string Label { get; set; } = "";             // 顯示名稱
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>銀行存款帳號基本資料（URS2.90.202）。</summary>
public class BankAccount : IAuditable, ISoftDelete
{
    public int Id { get; set; }
    public string AccountCode { get; set; } = "";       // 銀行帳號短碼（unique）
    public string AccountLongCode { get; set; } = "";   // 銀行帳號長碼
    public string BankCode { get; set; } = "";          // 銀行代碼（→ Bank）
    public string AccountName { get; set; } = "";       // 帳戶名稱（URS 外；其他作業顯示用）
    public string AccountPurpose { get; set; } = "";    // 帳號用途（URS 外）
    public int SortOrder { get; set; }                  // 排列序號（必填）
    public string DepositType { get; set; } = "1";      // 存款類別（對照碼 DEPOSIT_TYPE：1活存/2支存/3綜存）
    public string CurrencyType { get; set; } = "TWD";   // 幣別類型：TWD台幣 | FOREIGN外幣
    public string? CurrencyCode { get; set; }           // 幣別（→ Currencies）
    public string SubjectCode { get; set; } = "";       // 銀存子目（5碼，unique）
    public string LedgerType { get; set; } = "1";       // 帳冊別（LEDGER_TYPE：1不分紅/2分紅/3利變/4OIU）
    public string? FxAccountType { get; set; }          // 外幣帳戶類型（FX_ACCOUNT_TYPE：1一般/2外幣保單/3OIU；幣別類型=外幣時必填）
    public string BookingCurrency { get; set; } = "NTD"; // 記帳幣（推導：外幣保單=原幣，其餘 NTD）
    public bool IsSuspense { get; set; } = true;        // 暫收帳戶
    public bool IsPolicyAccount { get; set; }           // 保單帳戶（由外幣帳戶類型=外幣保單推導；匯率恆 1 的依據）
    public bool IsFedi { get; set; }                    // FEDI帳戶
    public bool IsCompanyMain { get; set; }             // 公司主調度帳戶
    public bool IsBankMain { get; set; }                // 同行主調度帳戶（同總行僅限一個）
    public bool IsDraft { get; set; }                   // 票匯
    public string InterestPayout { get; set; } = "2";   // 活存領息方式（INTEREST_PAYOUT：1年/2半年/3季/4月/5無；支存=5）
    public string InterestDays { get; set; } = "1";     // 活存計息天數（INTEREST_DAYS：1=360天/2=365天）
    public string? Memo { get; set; }                   // 備註
    public string? OpenDate { get; set; }               // 開戶日期（必填）
    public string? SuspendDate { get; set; }            // 停用日期（使用單位告知）
    public string? BankCloseDate { get; set; }          // 銀行結清日期
    public string? CompanyCloseDate { get; set; }       // 公司結清日期
    public string? ImportFileName { get; set; }         // 轉檔檔名（FUN2.1.1 用，URS 外）
    public bool IsActive { get; set; } = true;          // 帳號啟用；停用後不再進暫收/轉檔作業
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>存摺餘額（銀行端轉入/人工輸入）。唯一鍵：日期+帳號+幣別+轉入次別。</summary>
public class PassbookBalance
{
    public int Id { get; set; }
    public string BalanceDate { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string Currency { get; set; } = "";
    public decimal Balance { get; set; }
    public string DataType { get; set; } = "PREV_DAY";  // FILE_IMPORT | MANUAL | PREV_DAY
    public int ImportSeq { get; set; } = 1;             // 轉入次別（二次轉入 +1）
    public string? FileName { get; set; }
    public string? Memo { get; set; }
    public bool IsReviewed { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>暫收交易。唯一鍵：日期+類型+幣別+批號+帳號。</summary>
public class SuspenseTransaction
{
    public int Id { get; set; }
    public string TransactionNo { get; set; } = "";     // unique
    public string SuspenseDate { get; set; } = "";
    public string SuspenseType { get; set; } = "";      // DAILY | MANUAL | SECONDARY
    public string BatchNo { get; set; } = "";
    public string BankCode { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string Currency { get; set; } = "";
    public decimal PrevCompanyBalance { get; set; }
    public decimal PrevPassbookBalance { get; set; }
    public decimal TodayCompanyBalance { get; set; }
    public decimal TodayPassbookBalance { get; set; }
    public decimal TotalSuspenseAmount { get; set; }
    public decimal SuspenseAmount { get; set; }         // 立暫收金額 = 存摺 − 帳列
    public decimal ExchangeRate { get; set; } = 1;
    public decimal SuspenseAmountLocal { get; set; }    // 記帳幣金額
    public bool IsConfirmed { get; set; }
    public bool IsDayClosed { get; set; }
    public bool IsReportLocked { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
    public int Version { get; set; }                    // 樂觀鎖
}

/// <summary>批號確認狀態。唯一鍵：日期+幣別+批類+批號。</summary>
public class BatchConfirmation
{
    public int Id { get; set; }
    public string SuspenseDate { get; set; } = "";
    public string Currency { get; set; } = "";
    public string BatchType { get; set; } = "";
    public string BatchNo { get; set; } = "";
    public string ConfirmStatus { get; set; } = "UNCONFIRMED";
    public string? ConfirmedBy { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public string? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
    public int Version { get; set; }
}

/// <summary>傳票分錄（批號確認時產生，取消確認時刪除）。</summary>
public class VoucherEntry
{
    public int Id { get; set; }
    public string VoucherNo { get; set; } = "";
    public string SuspenseDate { get; set; } = "";
    public string BatchNo { get; set; } = "";
    public string BatchType { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string Currency { get; set; } = "";
    public string DebitCredit { get; set; } = "D";      // D | C
    public string AccountingCode { get; set; } = "";    // 會計科目
    public decimal Amount { get; set; }
    public decimal AmountLocal { get; set; }
    public string Summary { get; set; } = "";
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

/// <summary>通報明細（日常暫收確認時產生）。</summary>
public class ReportDetail
{
    public int Id { get; set; }
    public string SuspenseDate { get; set; } = "";
    public string BatchNo { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string Currency { get; set; } = "";
    public string ItemCode { get; set; } = "";
    public string DebitCredit { get; set; } = "D";
    public decimal Amount { get; set; }
    public string ReportSource { get; set; } = "5";
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

/// <summary>序號產生器（批號等）。</summary>
public class SequenceCounter
{
    public int Id { get; set; }
    public string CounterKey { get; set; } = "";        // unique
    public int CurrentValue { get; set; }
}

/// <summary>使用者。</summary>
public class User : IAuditable, ISoftDelete
{
    public int Id { get; set; }
    public string UserCode { get; set; } = "";          // unique
    public string UserName { get; set; } = "";
    public string Role { get; set; } = "STAFF";         // STAFF | MANAGER
    public bool IsActive { get; set; } = true;          // 停用後不可登入/切換、權限視同無
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>帳號維護權限（主辦/代理，代理可設有效期間）。指派紀錄＝關聯資料，允許實體刪除。</summary>
public class AccountManager : IAuditable
{
    public int Id { get; set; }
    public string AccountCode { get; set; } = "";
    public int UserId { get; set; }
    public string ManagerType { get; set; } = "PRIMARY"; // PRIMARY | AGENT
    public string? ValidFrom { get; set; }               // yyyy-MM-dd；null=不限（僅代理適用）
    public string? ValidTo { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>幣別對照（幣別/幣別類型/金額小數位）。</summary>
public class Currency : IAuditable, ISoftDelete
{
    public int Id { get; set; }
    public string Code { get; set; } = "";              // unique，例 NTD/USD
    public string Name { get; set; } = "";              // 中文名稱
    public string CurrencyType { get; set; } = "FOREIGN"; // TWD | FOREIGN
    public int DecimalPlaces { get; set; } = 2;         // 金額顯示小數位（NTD/JPY=0）
    public bool IsActive { get; set; } = true;          // 停用後不出現在幣別下拉
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>匯率檔（外幣對記帳幣 NTD）。取「日期（含）以前最近一筆」；交易留存匯率快照，刪除歷史匯率不影響既有交易。</summary>
public class ExchangeRate : IAuditable
{
    public int Id { get; set; }
    public string RateDate { get; set; } = "";          // 唯一鍵：日期+幣別
    public string CurrencyCode { get; set; } = "";
    public decimal Rate { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>假日檔（營業日判斷＝排除週六日＋本檔日期）。</summary>
public class Holiday : IAuditable
{
    public int Id { get; set; }
    public string HolidayDate { get; set; } = "";       // unique
    public string Name { get; set; } = "";
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>銀行格式設定（轉檔 profile）。鍵=銀行+幣別（幣別可 ZZZ 共用）+版本。</summary>
public class BankFormatProfile
{
    public int Id { get; set; }
    public string BankCode { get; set; } = "";
    public string Currency { get; set; } = "";          // 特定幣別或 ZZZ
    public string? ProfileName { get; set; }
    public string Engine { get; set; } = "DELIMITED";
    public string Encoding { get; set; } = "UTF-8";
    public string Delimiter { get; set; } = ",";
    public bool HasHeader { get; set; } = true;
    public int SkipRows { get; set; }
    public string? SheetName { get; set; }
    public string ColumnMapJson { get; set; } = "{}";   // ColumnMap 之 JSON
    public string? DateFormat { get; set; }             // YYYY-MM-DD / YYY/MM/DD(民國)
    public string? AmountFormatJson { get; set; }
    public string? CurrencyMapJson { get; set; }
    public int Version { get; set; } = 1;
    public string? EffectiveDate { get; set; }
    public string Status { get; set; } = "ACTIVE";      // ACTIVE | DRAFT | RETIRED
    public bool IsReviewed { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

/// <summary>轉檔歷程。</summary>
public class ImportLog
{
    public int Id { get; set; }
    public string BatchId { get; set; } = "";
    public string? FileName { get; set; }
    public string? AccountCode { get; set; }
    public int? ProfileId { get; set; }
    public string? BalanceDate { get; set; }
    public int TotalCount { get; set; }
    public int SuccessCount { get; set; }
    public int FailCount { get; set; }
    public string Status { get; set; } = "SUCCESS";
    public string? Errors { get; set; }                 // RowError[] 之 JSON
    public string UploadedBy { get; set; } = "System";
    public DateTime UploadedAt { get; set; } = DateTime.Now;
}

/// <summary>帳列餘額（本日結餘；由結帳流程供應，此系統唯讀消費）。</summary>
public class LedgerBalance
{
    public int Id { get; set; }
    public string BalanceDate { get; set; } = "";
    public string AccountCode { get; set; } = "";
    public string Currency { get; set; } = "";
    public decimal Balance { get; set; }
    public bool IsClosed { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string CreatedBy { get; set; } = "System";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public string UpdatedBy { get; set; } = "System";
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}
