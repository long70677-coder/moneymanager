using CashManagement.Data;
using CashManagement.Domain;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>暫收交易明細（含帳號基本資料 join 欄位）。</summary>
public class SuspenseTxView
{
    public required SuspenseTransaction Tx { get; init; }
    public string AccountPurpose { get; init; } = "";
    public string AccountName { get; init; } = "";
}

/// <summary>一個批號的查詢結果（畫面一張卡片）。</summary>
public class BatchData
{
    public string BatchNo { get; init; } = "";
    public string SuspenseDate { get; init; } = "";
    public string SuspenseType { get; init; } = "";
    public string Currency { get; init; } = "";
    public List<SuspenseTxView> Transactions { get; init; } = [];
    public BatchConfirmation? Confirmation { get; set; }
}

/// <summary>FUN2.1.2 暫收交易：查詢/新增/儲存/刪除/批號確認/取消確認（業務規則所在地）。</summary>
public class SuspenseService(IDbContextFactory<AppDbContext> factory)
{
    /// <summary>查詢暫收交易，依批號分組。批號非必填；幣別必填。</summary>
    public List<BatchData> Query(string? suspenseDate, string? suspenseType, string currency, string? batchNo, int userId)
    {
        if (string.IsNullOrEmpty(currency) || currency == "ALL")
            throw new BusinessException("幣別必填（同一批號僅限單一幣別）");

        using var db = factory.CreateDbContext();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, suspenseDate);
        if (accessible is { Count: 0 }) return [];

        var q = from st in db.SuspenseTransactions.AsNoTracking()
                join ba in db.BankAccounts.AsNoTracking() on st.AccountCode equals ba.AccountCode
                where st.Currency == currency
                select new { st, ba.AccountPurpose, ba.AccountName };

        if (!string.IsNullOrEmpty(suspenseDate)) q = q.Where(x => x.st.SuspenseDate == suspenseDate);
        if (!string.IsNullOrEmpty(suspenseType) && suspenseType != "ALL") q = q.Where(x => x.st.SuspenseType == suspenseType);
        if (!string.IsNullOrEmpty(batchNo)) q = q.Where(x => x.st.BatchNo == batchNo);
        if (accessible != null) q = q.Where(x => accessible.Contains(x.st.AccountCode));

        var rows = q.OrderBy(x => x.st.BatchNo).ThenBy(x => x.st.AccountCode).ToList();

        return rows.GroupBy(x => x.st.BatchNo).Select(g => new BatchData
        {
            BatchNo = g.Key,
            SuspenseDate = g.First().st.SuspenseDate,
            SuspenseType = g.First().st.SuspenseType,
            Currency = g.First().st.Currency,
            Transactions = g.Select(x => new SuspenseTxView { Tx = x.st, AccountPurpose = x.AccountPurpose, AccountName = x.AccountName }).ToList(),
            Confirmation = db.BatchConfirmations.AsNoTracking().FirstOrDefault(c => c.BatchNo == g.Key),
        }).ToList();
    }

    /// <summary>指定暫收日期下已存在的批號清單（供下拉；依權限過濾）。</summary>
    public List<string> GetBatchNumbers(string suspenseDate, int userId)
    {
        using var db = factory.CreateDbContext();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, suspenseDate);
        if (accessible is { Count: 0 }) return [];

        var q = db.SuspenseTransactions.AsNoTracking().Where(t => t.SuspenseDate == suspenseDate);
        if (accessible != null) q = q.Where(t => accessible.Contains(t.AccountCode));
        return q.Select(t => t.BatchNo).Distinct().OrderBy(b => b).ToList();
    }

    /// <summary>新增批號：對所有（有權限的）暫收帳戶各立一筆暫收交易。回傳 (批號, 筆數)。</summary>
    public (string BatchNo, int Count) CreateBatch(string suspenseDate, string suspenseType, string currency, string? batchNo, int userId)
    {
        if (string.IsNullOrEmpty(suspenseDate) || suspenseType == "ALL" || currency == "ALL")
            throw new BusinessException("必填欄位未填（暫收日期、暫收類型、幣別）");

        using var db = factory.CreateDbContext();

        if (db.SuspenseTransactions.Any(t => t.SuspenseDate == suspenseDate && t.Currency == currency && t.IsDayClosed))
            throw new BusinessException("作帳日該幣別已日結，不可新增");

        if (suspenseType == SuspenseTypes.Daily
            && db.SuspenseTransactions.Any(t => t.SuspenseDate == suspenseDate && t.Currency == currency && t.IsReportLocked))
            throw new BusinessException("已通報鎖定，不可新增日常暫收");

        using var txn = db.Database.BeginTransaction();

        // 取得或生成批號
        var finalBatchNo = batchNo;
        if (string.IsNullOrEmpty(finalBatchNo))
        {
            var counterKey = $"BATCH_{suspenseType}_{suspenseDate.Replace("-", "")}_{currency}";
            var counter = db.SequenceCounters.FirstOrDefault(c => c.CounterKey == counterKey);
            if (counter == null)
            {
                counter = new SequenceCounter { CounterKey = counterKey, CurrentValue = 0 };
                db.SequenceCounters.Add(counter);
            }
            counter.CurrentValue++;
            finalBatchNo = $"{suspenseDate.Replace("-", "")}{counter.CurrentValue:000}";
            db.SaveChanges();
        }

        if (db.SuspenseTransactions.Any(t => t.BatchNo == finalBatchNo && t.SuspenseDate == suspenseDate && t.SuspenseType == suspenseType && t.Currency == currency))
            throw new BusinessException("指定批號已存在資料，不可新增");

        var otherCurrency = db.SuspenseTransactions
            .Where(t => t.BatchNo == finalBatchNo && t.Currency != currency)
            .Select(t => t.Currency).Distinct().FirstOrDefault();
        if (otherCurrency != null)
            throw new BusinessException($"批號 {finalBatchNo} 已用於幣別 {otherCurrency}，同一批號不可混用不同幣別");

        // 暫收帳戶（NTD→TWD、其餘→FOREIGN），依權限過濾
        var curType = currency == "NTD" ? "TWD" : "FOREIGN";
        var accounts = db.BankAccounts.AsNoTracking().Where(a => a.IsActive && a.IsSuspense && a.CurrencyType == curType).ToList();

        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, suspenseDate);
        if (accessible != null)
        {
            var allowed = accessible.ToHashSet();
            accounts = accounts.Where(a => allowed.Contains(a.AccountCode)).ToList();
            if (accounts.Count == 0)
                throw new BusinessException("您沒有可立暫收的帳號（請確認帳號維護權限）");
        }

        var prevDate = PrevBusinessDay(db, suspenseDate);
        // 匯率：取暫收日期（含）以前最近一筆（SA：匯率取暫收日期以前最近一筆有效資料）；
        // 台幣與保單帳戶恆為 1，於迴圈內判斷。查無匯率即擋下，避免以錯誤匯率立帳。
        decimal? fxRate = null;
        if (currency != "NTD")
        {
            fxRate = db.ExchangeRates.AsNoTracking()
                .Where(r => r.CurrencyCode == currency && string.Compare(r.RateDate, suspenseDate) <= 0)
                .OrderByDescending(r => r.RateDate)
                .Select(r => (decimal?)r.Rate).FirstOrDefault()
                ?? throw new BusinessException($"查無幣別 {currency} 於 {suspenseDate}（含）以前的匯率，請先至「基本資料＞匯率」維護");
        }

        var seq = 1;
        foreach (var account in accounts)
        {
            var txNo = $"ST-{suspenseDate.Replace("-", "")}-{finalBatchNo}-{seq:000}";

            decimal prevComp = 0, prevPass = 0, todayComp = 0, todayPass = 0, amount = 0, rate = 1;

            if (suspenseType == SuspenseTypes.Daily)
            {
                prevPass = FindReviewedBalance(db, prevDate, account.AccountCode, currency) ?? 0;
                prevComp = prevPass;
                amount = prevPass - prevComp;
            }
            else if (suspenseType == SuspenseTypes.Secondary)
            {
                todayPass = FindReviewedBalance(db, suspenseDate, account.AccountCode, currency) ?? 0;
                todayComp = todayPass;
                amount = todayPass - todayComp;
            }
            // MANUAL：全零，由使用者輸入

            if (currency != "NTD" && !account.IsPolicyAccount) rate = fxRate!.Value;

            db.SuspenseTransactions.Add(new SuspenseTransaction
            {
                TransactionNo = txNo, SuspenseDate = suspenseDate, SuspenseType = suspenseType,
                BatchNo = finalBatchNo, BankCode = account.BankCode, AccountCode = account.AccountCode,
                Currency = currency,
                PrevCompanyBalance = prevComp, PrevPassbookBalance = prevPass,
                TodayCompanyBalance = todayComp, TodayPassbookBalance = todayPass,
                TotalSuspenseAmount = amount, SuspenseAmount = amount,
                ExchangeRate = rate, SuspenseAmountLocal = amount * rate,
            });
            seq++;
        }

        if (!db.BatchConfirmations.Any(c => c.SuspenseDate == suspenseDate && c.Currency == currency && c.BatchType == suspenseType && c.BatchNo == finalBatchNo))
        {
            db.BatchConfirmations.Add(new BatchConfirmation
            {
                SuspenseDate = suspenseDate, Currency = currency, BatchType = suspenseType, BatchNo = finalBatchNo,
            });
        }

        db.SaveChanges();
        txn.Commit();
        return (finalBatchNo, accounts.Count);
    }

    /// <summary>儲存立暫收金額（樂觀鎖：version 相符且未確認未日結才更新）。回傳 (成功, 失敗) 筆數。</summary>
    public (int Success, int Fail) SaveAmounts(List<(int Id, decimal Amount, int Version)> edits, string operatorName)
    {
        if (edits.Count == 0) throw new BusinessException("無資料可儲存");

        using var db = factory.CreateDbContext();
        using var txn = db.Database.BeginTransaction();
        int success = 0, fail = 0;
        foreach (var (id, amount, version) in edits)
        {
            var changes = db.SuspenseTransactions
                .Where(t => t.Id == id && t.Version == version && !t.IsConfirmed && !t.IsDayClosed)
                .ExecuteUpdate(s => s
                    .SetProperty(t => t.SuspenseAmount, amount)
                    .SetProperty(t => t.SuspenseAmountLocal, t => amount * t.ExchangeRate)
                    .SetProperty(t => t.TotalSuspenseAmount, amount)
                    .SetProperty(t => t.UpdatedBy, operatorName)
                    .SetProperty(t => t.UpdatedAt, DateTime.Now)
                    .SetProperty(t => t.Version, t => t.Version + 1));
            if (changes > 0) success++; else fail++;
        }
        txn.Commit();
        return (success, fail);
    }

    /// <summary>整批刪除。回傳刪除筆數。</summary>
    public int DeleteBatch(string batchNo, int userId)
    {
        using var db = factory.CreateDbContext();
        EnsureBatchOwnership(db, batchNo, userId);

        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.IsConfirmed))
            throw new BusinessException("批號已確認，不得刪除");
        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.IsDayClosed))
            throw new BusinessException("已日結，不得刪除");
        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.SuspenseType == SuspenseTypes.Daily && t.IsReportLocked))
            throw new BusinessException("已通報鎖定之日常暫收不得刪除");

        using var txn = db.Database.BeginTransaction();
        var count = db.SuspenseTransactions.Where(t => t.BatchNo == batchNo).ExecuteDelete();
        db.BatchConfirmations.Where(c => c.BatchNo == batchNo).ExecuteDelete();
        txn.Commit();
        return count;
    }

    /// <summary>批號確認：更新狀態＋產生傳票＋日常暫收寫通報。回傳產票交易筆數。</summary>
    public int Confirm(string batchNo, string? batchType, string? suspenseDate, string operatorName, int userId)
    {
        using var db = factory.CreateDbContext();
        EnsureBatchOwnership(db, batchNo, userId, suspenseDate);

        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.IsDayClosed))
            throw new BusinessException("已日結，不得確認");
        if (!db.SuspenseTransactions.Any(t => t.BatchNo == batchNo))
            throw new BusinessException("已被刪除，不得確認");
        if (batchType == SuspenseTypes.Daily
            && db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.SuspenseType == SuspenseTypes.Daily && t.IsReportLocked))
            throw new BusinessException("已通報鎖定，不得確認日常暫收");

        using var txn = db.Database.BeginTransaction();

        db.SuspenseTransactions.Where(t => t.BatchNo == batchNo).ExecuteUpdate(s => s
            .SetProperty(t => t.IsConfirmed, true)
            .SetProperty(t => t.UpdatedBy, operatorName)
            .SetProperty(t => t.UpdatedAt, DateTime.Now)
            .SetProperty(t => t.Version, t => t.Version + 1));

        db.BatchConfirmations.Where(c => c.BatchNo == batchNo).ExecuteUpdate(s => s
            .SetProperty(c => c.ConfirmStatus, "CONFIRMED")
            .SetProperty(c => c.ConfirmedBy, operatorName)
            .SetProperty(c => c.ConfirmedAt, DateTime.Now)
            .SetProperty(c => c.Version, c => c.Version + 1));

        // 產生傳票（金額非零者；一筆交易＝借貸各一筆分錄）
        var transactions = db.SuspenseTransactions.AsNoTracking()
            .Where(t => t.BatchNo == batchNo && t.SuspenseAmount != 0).ToList();

        var voucherSeq = 1;
        foreach (var tx in transactions)
        {
            var voucherNo = $"V-{batchNo}-{voucherSeq:000}";
            var isDebit = tx.SuspenseAmount >= 0;
            var accountingCode = tx.Currency == "NTD" ? "1131" : "1132";
            var amount = Math.Abs(tx.SuspenseAmount);
            var amountLocal = Math.Abs(tx.SuspenseAmountLocal);

            var longCode = db.BankAccounts.AsNoTracking()
                .Where(a => a.AccountCode == tx.AccountCode).Select(a => a.AccountLongCode).FirstOrDefault();
            var summary = $"暫收 批號:{batchNo} 帳號:{longCode ?? tx.AccountCode}";

            db.VoucherEntries.Add(NewVoucher(tx, voucherNo, isDebit ? "D" : "C", accountingCode, amount, amountLocal, summary, operatorName));
            db.VoucherEntries.Add(NewVoucher(tx, voucherNo, isDebit ? "C" : "D", accountingCode == "1131" ? "2141" : "2142", amount, amountLocal, summary, operatorName));
            voucherSeq++;
        }

        // 日常暫收 → 通報明細
        foreach (var tx in transactions.Where(t => t.SuspenseType == SuspenseTypes.Daily))
        {
            db.ReportDetails.Add(new ReportDetail
            {
                SuspenseDate = tx.SuspenseDate, BatchNo = batchNo, AccountCode = tx.AccountCode,
                Currency = tx.Currency, ItemCode = "SUSP-001", DebitCredit = "D",
                Amount = Math.Abs(tx.SuspenseAmount), CreatedBy = operatorName,
            });
        }

        db.SaveChanges();
        txn.Commit();
        return transactions.Count;
    }

    /// <summary>取消批號確認：狀態回未確認＋刪除傳票與通報。回傳 (刪傳票, 刪通報) 筆數。</summary>
    public (int Vouchers, int Reports) CancelConfirm(string batchNo, string? suspenseDate, string operatorName, int userId)
    {
        using var db = factory.CreateDbContext();
        EnsureBatchOwnership(db, batchNo, userId, suspenseDate);

        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.IsDayClosed))
            throw new BusinessException("已日結，不得取消確認");
        if (db.SuspenseTransactions.Any(t => t.BatchNo == batchNo && t.SuspenseType == SuspenseTypes.Daily && t.IsReportLocked))
            throw new BusinessException("已通報鎖定，不得取消日常暫收確認");

        using var txn = db.Database.BeginTransaction();

        db.SuspenseTransactions.Where(t => t.BatchNo == batchNo).ExecuteUpdate(s => s
            .SetProperty(t => t.IsConfirmed, false)
            .SetProperty(t => t.UpdatedBy, operatorName)
            .SetProperty(t => t.UpdatedAt, DateTime.Now)
            .SetProperty(t => t.Version, t => t.Version + 1));

        db.BatchConfirmations.Where(c => c.BatchNo == batchNo).ExecuteUpdate(s => s
            .SetProperty(c => c.ConfirmStatus, "UNCONFIRMED")
            .SetProperty(c => c.CancelledBy, operatorName)
            .SetProperty(c => c.CancelledAt, DateTime.Now)
            .SetProperty(c => c.Version, c => c.Version + 1));

        var vouchers = db.VoucherEntries.Where(v => v.BatchNo == batchNo).ExecuteDelete();
        var reports = db.ReportDetails.Where(r => r.BatchNo == batchNo).ExecuteDelete();

        txn.Commit();
        return (vouchers, reports);
    }

    /// <summary>經辦需該批所有帳號皆在其可維護範圍，否則拋出；主管不限。</summary>
    private static void EnsureBatchOwnership(AppDbContext db, string batchNo, int userId, string? refDate = null)
    {
        refDate ??= db.SuspenseTransactions.AsNoTracking()
            .Where(t => t.BatchNo == batchNo).Select(t => t.SuspenseDate).FirstOrDefault();
        var accessible = PermissionService.GetAccessibleAccountCodes(db, userId, refDate);
        if (accessible == null) return; // 主管

        var allowed = accessible.ToHashSet();
        var accounts = db.SuspenseTransactions.AsNoTracking()
            .Where(t => t.BatchNo == batchNo).Select(t => t.AccountCode).Distinct().ToList();
        if (accounts.Any(code => !allowed.Contains(code)))
            throw new BusinessException("此批號包含您無權維護的帳號，無法操作");
    }

    /// <summary>已覆核的存摺餘額（同 key 多筆取最新轉入次別）。</summary>
    internal static decimal? FindReviewedBalance(AppDbContext db, string balanceDate, string accountCode, string currency) =>
        db.PassbookBalances.AsNoTracking()
            .Where(p => p.BalanceDate == balanceDate && p.AccountCode == accountCode && p.Currency == currency && p.IsReviewed)
            .OrderByDescending(p => p.ImportSeq)
            .Select(p => (decimal?)p.Balance)
            .FirstOrDefault();

    // 營業日＝非週六日且不在假日檔（基本資料＞假日）。
    internal static string PrevBusinessDay(AppDbContext db, string iso)
    {
        var holidays = HolidaySet(db);
        var d = DateTime.Parse(iso).AddDays(-1);
        while (IsNonBusinessDay(d, holidays)) d = d.AddDays(-1);
        return d.ToString("yyyy-MM-dd");
    }

    internal static string NextBusinessDay(AppDbContext db, string iso)
    {
        var holidays = HolidaySet(db);
        var d = DateTime.Parse(iso);
        do { d = d.AddDays(1); } while (IsNonBusinessDay(d, holidays));
        return d.ToString("yyyy-MM-dd");
    }

    private static HashSet<string> HolidaySet(AppDbContext db) =>
        db.Holidays.AsNoTracking().Select(h => h.HolidayDate).ToHashSet();

    private static bool IsNonBusinessDay(DateTime d, HashSet<string> holidays) =>
        d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || holidays.Contains(d.ToString("yyyy-MM-dd"));

    private static VoucherEntry NewVoucher(SuspenseTransaction tx, string voucherNo, string dc, string accountingCode,
        decimal amount, decimal amountLocal, string summary, string createdBy) =>
        new()
        {
            VoucherNo = voucherNo, SuspenseDate = tx.SuspenseDate, BatchNo = tx.BatchNo, BatchType = tx.SuspenseType,
            AccountCode = tx.AccountCode, Currency = tx.Currency, DebitCredit = dc, AccountingCode = accountingCode,
            Amount = amount, AmountLocal = amountLocal, Summary = summary, CreatedBy = createdBy,
        };
}
