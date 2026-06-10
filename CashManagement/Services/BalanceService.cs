using CashManagement.Data;
using CashManagement.Domain;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>餘額維護畫面一列：帳列餘額(唯讀) + 存摺轉入餘額(可改) + 差額。</summary>
public class BalanceRow
{
    public string AccountCode { get; init; } = "";
    public string AccountName { get; init; } = "";
    public string AccountPurpose { get; init; } = "";
    public string Currency { get; init; } = "";
    public decimal? LedgerBalance { get; init; }
    public decimal? PassbookBalance { get; init; }
    public string? DataType { get; init; }
    public int? ImportSeq { get; init; }
    public bool IsReviewed { get; init; }
    public decimal? Diff => PassbookBalance.HasValue && LedgerBalance.HasValue ? PassbookBalance - LedgerBalance : null;
}

/// <summary>FUN2.1.1 餘額維護：兩餘額並陳查詢/人工調整/全批覆核。</summary>
public class BalanceService(IDbContextFactory<AppDbContext> factory)
{
    /// <summary>餘額維護畫面資料：以（有權限的）暫收帳戶為基礎。</summary>
    public List<BalanceRow> GetRows(string balanceDate, string currency, int userId)
    {
        if (string.IsNullOrEmpty(balanceDate) || string.IsNullOrEmpty(currency))
            throw new BusinessException("餘額日期與幣別必填");

        using var db = factory.CreateDbContext();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, balanceDate);
        if (accessible is { Count: 0 }) return [];

        var curType = currency == "NTD" ? "TWD" : "FOREIGN";
        var accounts = db.BankAccounts.AsNoTracking()
            .Where(a => a.IsSuspense && a.CurrencyType == curType)
            .OrderBy(a => a.AccountCode).ToList();
        if (accessible != null)
        {
            var allow = accessible.ToHashSet();
            accounts = accounts.Where(a => allow.Contains(a.AccountCode)).ToList();
        }

        return accounts.Select(a =>
        {
            var ledger = db.LedgerBalances.AsNoTracking()
                .Where(l => l.BalanceDate == balanceDate && l.AccountCode == a.AccountCode && l.Currency == currency)
                .Select(l => (decimal?)l.Balance).FirstOrDefault();
            var pb = db.PassbookBalances.AsNoTracking()
                .Where(p => p.BalanceDate == balanceDate && p.AccountCode == a.AccountCode && p.Currency == currency)
                .OrderByDescending(p => p.ImportSeq).FirstOrDefault();
            return new BalanceRow
            {
                AccountCode = a.AccountCode, AccountName = a.AccountName, AccountPurpose = a.AccountPurpose,
                Currency = currency, LedgerBalance = ledger,
                PassbookBalance = pb?.Balance, DataType = pb?.DataType, ImportSeq = pb?.ImportSeq,
                IsReviewed = pb?.IsReviewed ?? false,
            };
        }).ToList();
    }

    /// <summary>儲存人工調整（勾選編輯的列）：data_type→MANUAL、回未覆核。回傳儲存筆數。</summary>
    public int SaveManualEdits(string balanceDate, string currency, List<(string AccountCode, decimal Balance)> edits, int userId, string operatorName)
    {
        if (string.IsNullOrEmpty(balanceDate) || string.IsNullOrEmpty(currency) || edits.Count == 0)
            throw new BusinessException("無可儲存的資料");

        using var db = factory.CreateDbContext();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, balanceDate);
        var allow = accessible?.ToHashSet();

        using var txn = db.Database.BeginTransaction();
        var saved = 0;
        foreach (var (accountCode, balance) in edits)
        {
            if (allow != null && !allow.Contains(accountCode)) continue; // 無權限略過

            var latest = db.PassbookBalances
                .Where(p => p.BalanceDate == balanceDate && p.AccountCode == accountCode && p.Currency == currency)
                .OrderByDescending(p => p.ImportSeq).FirstOrDefault();
            if (latest != null)
            {
                latest.Balance = balance;
                latest.DataType = BalanceDataTypes.ManualInput;
                latest.IsReviewed = false;
                latest.ReviewedBy = null;
                latest.ReviewedAt = null;
                latest.UpdatedBy = operatorName;
                latest.UpdatedAt = DateTime.Now;
            }
            else
            {
                db.PassbookBalances.Add(new PassbookBalance
                {
                    BalanceDate = balanceDate, AccountCode = accountCode, Currency = currency,
                    Balance = balance, DataType = BalanceDataTypes.ManualInput, ImportSeq = 1,
                    CreatedBy = operatorName, UpdatedBy = operatorName,
                });
            }
            saved++;
        }
        db.SaveChanges();
        txn.Commit();
        return saved;
    }

    /// <summary>全批覆核：指定日期+幣別（依權限範圍）設為已覆核。回傳覆核筆數。</summary>
    public int ReviewBatch(string balanceDate, string currency, int userId, string reviewer)
    {
        using var db = factory.CreateDbContext();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, balanceDate);
        if (accessible is { Count: 0 }) return 0;

        var q = db.PassbookBalances.Where(p => p.BalanceDate == balanceDate && p.Currency == currency);
        if (accessible != null) q = q.Where(p => accessible.Contains(p.AccountCode));

        return q.ExecuteUpdate(s => s
            .SetProperty(p => p.IsReviewed, true)
            .SetProperty(p => p.ReviewedBy, reviewer)
            .SetProperty(p => p.ReviewedAt, DateTime.Now)
            .SetProperty(p => p.UpdatedBy, reviewer)
            .SetProperty(p => p.UpdatedAt, DateTime.Now));
    }
}
