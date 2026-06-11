using CashManagement.Data;
using CashManagement.Domain;
using CashManagement.Services.Master;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>查詢區條件（URS2.90.202 §一）。</summary>
public class AccountQuery
{
    public string? HeadOfficeCode { get; set; }   // 銀行總行代號
    public string? BankCode { get; set; }         // 銀行代碼
    public string? AccountCode { get; set; }      // 銀行帳號(短)
    public string? DepositType { get; set; }      // 存款類別
    public string? LedgerType { get; set; }       // 帳冊別
    public string? CurrencyType { get; set; }     // 幣別類型
    public string? CurrencyCode { get; set; }     // 幣別
    // 其他條件（勾選＝僅列出該類帳戶）
    public bool OnlySuspense { get; set; }
    public bool OnlyFedi { get; set; }
    public bool OnlyCompanyMain { get; set; }
    public bool OnlyBankMain { get; set; }
    public bool OnlyDraft { get; set; }
}

/// <summary>顯示區一列：帳號＋分行簡稱（join 銀行基本資料檔）。</summary>
public class AccountRowView
{
    public required BankAccount Account { get; init; }
    public string? BankShortName { get; init; }
}

/// <summary>畫面下拉選單資料（一次載入）。</summary>
public class AccountLookups
{
    public List<Bank> Banks { get; init; } = [];
    public List<Currency> Currencies { get; init; } = [];
    /// <summary>對照碼：Category → [(Code, Label)]（依 SortOrder）。</summary>
    public Dictionary<string, List<(string Code, string Label)>> Codes { get; init; } = [];

    public string CodeLabel(string category, string? code) =>
        Codes.TryGetValue(category, out var list)
            ? list.FirstOrDefault(x => x.Code == code).Label ?? (code ?? "")
            : code ?? "";
}

/// <summary>
/// 銀行帳號基本資料維護（URS2.90.202）：查詢／新增／批次儲存（勾選列）／刪除。
/// 檢核 A–D 訊息文案依規格。維護動作限主管。
/// </summary>
public class BankAccountService(IDbContextFactory<AppDbContext> factory)
{
    public AccountLookups GetLookups()
    {
        using var db = factory.CreateDbContext();
        return new AccountLookups
        {
            Banks = db.Banks.AsNoTracking().Where(b => b.IsActive).OrderBy(b => b.BankCode).ToList(),
            Currencies = db.Currencies.AsNoTracking().Where(c => c.IsActive)
                .OrderByDescending(c => c.CurrencyType).ThenBy(c => c.Code).ToList(),
            Codes = db.CodeMaps.AsNoTracking().Where(c => c.IsActive)
                .OrderBy(c => c.SortOrder).AsEnumerable()
                .GroupBy(c => c.Category)
                .ToDictionary(g => g.Key, g => g.Select(c => (c.Code, c.Label)).ToList()),
        };
    }

    /// <summary>帳號短碼下拉（查詢區 §一-3：顯示短碼、備註長碼）。</summary>
    public List<(string Code, string LongCode)> GetAccountCodeOptions()
    {
        using var db = factory.CreateDbContext();
        return db.BankAccounts.AsNoTracking().OrderBy(a => a.AccountCode)
            .Select(a => new { a.AccountCode, a.AccountLongCode }).AsEnumerable()
            .Select(a => (a.AccountCode, a.AccountLongCode)).ToList();
    }

    public List<AccountRowView> Query(AccountQuery q)
    {
        using var db = factory.CreateDbContext();
        var src = from a in db.BankAccounts.AsNoTracking()
                  join bk in db.Banks.AsNoTracking() on a.BankCode equals bk.BankCode into g
                  from bk in g.DefaultIfEmpty()
                  select new { a, bk };

        if (!string.IsNullOrEmpty(q.HeadOfficeCode)) src = src.Where(x => x.bk != null && x.bk.HeadOfficeCode == q.HeadOfficeCode);
        if (!string.IsNullOrEmpty(q.BankCode)) src = src.Where(x => x.a.BankCode == q.BankCode);
        if (!string.IsNullOrEmpty(q.AccountCode)) src = src.Where(x => x.a.AccountCode == q.AccountCode);
        if (!string.IsNullOrEmpty(q.DepositType)) src = src.Where(x => x.a.DepositType == q.DepositType);
        if (!string.IsNullOrEmpty(q.LedgerType)) src = src.Where(x => x.a.LedgerType == q.LedgerType);
        if (!string.IsNullOrEmpty(q.CurrencyType)) src = src.Where(x => x.a.CurrencyType == q.CurrencyType);
        if (!string.IsNullOrEmpty(q.CurrencyCode)) src = src.Where(x => x.a.CurrencyCode == q.CurrencyCode);
        if (q.OnlySuspense) src = src.Where(x => x.a.IsSuspense);
        if (q.OnlyFedi) src = src.Where(x => x.a.IsFedi);
        if (q.OnlyCompanyMain) src = src.Where(x => x.a.IsCompanyMain);
        if (q.OnlyBankMain) src = src.Where(x => x.a.IsBankMain);
        if (q.OnlyDraft) src = src.Where(x => x.a.IsDraft);

        return src.OrderBy(x => x.a.SortOrder).ThenBy(x => x.a.AccountCode)
            .AsEnumerable()
            .Select(x => new AccountRowView { Account = x.a, BankShortName = x.bk?.ShortName })
            .ToList();
    }

    /// <summary>新增（新增視窗確定後）。</summary>
    public void Create(BankAccount a, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        using var db = factory.CreateDbContext();
        ValidateAccount(db, a);
        Derive(a);
        a.CreatedBy = a.UpdatedBy = actor.UserName;
        a.CreatedAt = a.UpdatedAt = DateTime.Now;
        db.BankAccounts.Add(a);
        db.SaveChanges();
    }

    /// <summary>批次儲存勾選列（URS §二【儲存】）：全部檢核通過才寫入（單一交易）。</summary>
    public int Save(List<BankAccount> edited, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        if (edited.Count == 0) throw new BusinessException("請先勾選項目再執行");

        using var db = factory.CreateDbContext();
        using var txn = db.Database.BeginTransaction();

        var targets = new List<(BankAccount Db, BankAccount Edit)>();
        foreach (var e in edited)
        {
            var existing = db.BankAccounts.Find(e.Id)
                ?? throw new BusinessException($"銀行帳號(短)：【{e.AccountCode}】資料已被刪除，請重新查詢");
            CopyEditable(e, existing);
            ValidateAccount(db, existing);
            Derive(existing);
            existing.UpdatedBy = actor.UserName;
            existing.UpdatedAt = DateTime.Now;
            targets.Add((existing, e));
        }

        db.SaveChanges();
        txn.Commit();
        return targets.Count;
    }

    /// <summary>刪除勾選列：被交易/權限參照者擋（提示改停用）。</summary>
    public int Delete(List<int> ids, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        if (ids.Count == 0) throw new BusinessException("請先勾選項目再執行");

        using var db = factory.CreateDbContext();
        using var txn = db.Database.BeginTransaction();
        var count = 0;
        foreach (var id in ids)
        {
            var a = db.BankAccounts.Find(id);
            if (a == null) continue;

            var refs = new List<string>();
            if (db.PassbookBalances.Any(p => p.AccountCode == a.AccountCode)) refs.Add("存摺餘額");
            if (db.SuspenseTransactions.Any(t => t.AccountCode == a.AccountCode)) refs.Add("暫收交易");
            if (db.AccountManagers.Any(m => m.AccountCode == a.AccountCode)) refs.Add("帳號維護權限");
            if (refs.Count > 0)
                throw new BusinessException($"帳號 {a.AccountCode} 已被{string.Join("、", refs)}參照，無法刪除，請改用「帳號啟用」取消勾選後儲存（停用）");

            db.BankAccounts.Remove(a);
            count++;
        }
        db.SaveChanges();
        txn.Commit();
        return count;
    }

    // ── 內部 ────────────────────────────────────────────────

    /// <summary>顯示區可編輯欄位回寫（R 欄位不回寫）。</summary>
    private static void CopyEditable(BankAccount from, BankAccount to)
    {
        to.SortOrder = from.SortOrder;
        to.DepositType = from.DepositType;
        to.CurrencyType = from.CurrencyType;
        to.CurrencyCode = from.CurrencyCode;
        to.SubjectCode = from.SubjectCode;
        to.LedgerType = from.LedgerType;
        to.FxAccountType = from.FxAccountType;
        to.IsSuspense = from.IsSuspense;
        to.IsFedi = from.IsFedi;
        to.IsCompanyMain = from.IsCompanyMain;
        to.IsBankMain = from.IsBankMain;
        to.IsDraft = from.IsDraft;
        to.InterestPayout = from.InterestPayout;
        to.InterestDays = from.InterestDays;
        to.Memo = from.Memo;
        to.OpenDate = from.OpenDate;
        to.SuspendDate = from.SuspendDate;
        to.BankCloseDate = from.BankCloseDate;
        to.CompanyCloseDate = from.CompanyCloseDate;
        to.ImportFileName = from.ImportFileName;
        to.IsActive = from.IsActive;
    }

    /// <summary>URS 檢核 B/C/D ＋ 規格附帶規則。</summary>
    private static void ValidateAccount(AppDbContext db, BankAccount a)
    {
        // B. 必填（顯示區 V 欄位＋識別欄位）
        if (string.IsNullOrWhiteSpace(a.BankCode) || string.IsNullOrWhiteSpace(a.AccountCode)
            || string.IsNullOrWhiteSpace(a.AccountLongCode) || a.SortOrder <= 0
            || string.IsNullOrWhiteSpace(a.DepositType) || string.IsNullOrWhiteSpace(a.CurrencyType)
            || string.IsNullOrWhiteSpace(a.CurrencyCode) || string.IsNullOrWhiteSpace(a.SubjectCode)
            || string.IsNullOrWhiteSpace(a.LedgerType) || string.IsNullOrWhiteSpace(a.OpenDate))
            throw new BusinessException("請填寫必填欄位");

        // 銀存子目：檢核碼長度 5 碼
        if (a.SubjectCode.Trim().Length != 5)
            throw new BusinessException($"銀存子目：【{a.SubjectCode}】長度須為 5 碼");

        // 外幣帳戶類型：幣別類型=外幣時必填
        if (a.CurrencyType == "FOREIGN" && string.IsNullOrWhiteSpace(a.FxAccountType))
            throw new BusinessException("請填寫必填欄位（幣別類型為外幣時，外幣帳戶類型必填）");

        // C-i. 資料重複（銀行代碼＋銀行帳號(短)）
        if (db.BankAccounts.Any(x => x.Id != a.Id && x.BankCode == a.BankCode && x.AccountCode == a.AccountCode))
            throw new BusinessException($"銀行代碼：【{a.BankCode}】，銀行帳號(短)：【{a.AccountCode}】；資料已存在");

        // C-ii. 資料重複（銀存子目）
        if (db.BankAccounts.Any(x => x.Id != a.Id && x.SubjectCode == a.SubjectCode))
            throw new BusinessException($"銀存子目：【{a.SubjectCode}】，資料已存在");

        // D. 同行主調度帳戶：同一總行僅限一個
        if (a.IsBankMain)
        {
            var headOffice = db.Banks.AsNoTracking()
                .Where(b => b.BankCode == a.BankCode).Select(b => b.HeadOfficeCode).FirstOrDefault();
            if (headOffice != null)
            {
                var conflict = (from x in db.BankAccounts.AsNoTracking()
                                join bk in db.Banks.AsNoTracking() on x.BankCode equals bk.BankCode
                                where x.Id != a.Id && x.IsBankMain && bk.HeadOfficeCode == headOffice
                                select x.BankCode).FirstOrDefault();
                if (conflict != null)
                    throw new BusinessException($"已有銀行代碼：【{conflict}】設定為同行主調度帳戶");
            }
        }
    }

    /// <summary>推導欄位：記帳幣（外幣保單=原幣，其餘 NTD）、保單帳戶旗標、支存領息=無。</summary>
    private static void Derive(BankAccount a)
    {
        a.IsPolicyAccount = a.CurrencyType == "FOREIGN" && a.FxAccountType == "2";
        a.BookingCurrency = a.IsPolicyAccount ? (a.CurrencyCode ?? "NTD") : "NTD";
        if (a.DepositType == "2") a.InterestPayout = "5"; // 支存：活存領息方式=無
        if (a.CurrencyType == "TWD") a.FxAccountType = null;
    }
}
