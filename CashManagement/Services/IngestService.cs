using System.Text.Json;
using CashManagement.Data;
using CashManagement.Domain;
using CashManagement.Services.Parsing;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

public class IngestInput
{
    public string FileName { get; init; } = "";
    public byte[] Content { get; init; } = [];
    public string ScreenBalanceDate { get; init; } = ""; // 畫面餘額日期（檢核檔內日期須一致）
    public int UserId { get; init; }
    public bool SecondImport { get; init; }              // ☑ 二次轉入
    public string Operator { get; init; } = "User";
}

/// <summary>
/// FUN2.1.1 轉檔三段式：Parse → Map → Validate+Write。
/// 一檔一帳號（檔名路由）；逐檔獨立、不互相中斷。
/// </summary>
public class IngestService(IDbContextFactory<AppDbContext> factory)
{
    /// <summary>多檔上傳：檢核重複檔名 → 逐檔轉入 → 寫轉檔歷程。</summary>
    public List<ImportResult> IngestFiles(List<(string FileName, byte[] Content)> files, string balanceDate, int userId, bool secondImport, string operatorName)
    {
        if (files.Count == 0) throw new BusinessException("未選擇檔案");
        if (string.IsNullOrEmpty(balanceDate)) throw new BusinessException("餘額日期必填");

        // 同批多檔不得有重複檔名
        var dup = files.GroupBy(f => f.FileName).FirstOrDefault(g => g.Count() > 1);
        if (dup != null) throw new BusinessException($"上傳檔案有重複檔名：{dup.Key}");

        var batchId = $"IMP-{DateTimeOffset.Now.ToUnixTimeMilliseconds()}";
        var results = new List<ImportResult>();
        foreach (var (fileName, content) in files)
        {
            var result = IngestFile(new IngestInput
            {
                FileName = fileName, Content = content, ScreenBalanceDate = balanceDate,
                UserId = userId, SecondImport = secondImport, Operator = operatorName,
            });
            WriteLog(batchId, result, operatorName);
            results.Add(result);
        }
        return results;
    }

    /// <summary>試轉預覽（dry-run）：路由→profile→解析→對應，只回結果不寫入。</summary>
    public PreviewResult PreviewFile(string fileName, byte[] content)
    {
        using var db = factory.CreateDbContext();
        var result = new PreviewResult { FileName = fileName };

        var matched = db.BankAccounts.AsNoTracking().Where(a => a.IsActive && a.ImportFileName == fileName).ToList();
        if (matched.Count == 0) { result.Error = "檔名比對不到帳號"; return result; }
        if (matched.Count > 1) { result.Error = "檔名命中多個帳號"; return result; }

        var account = matched[0];
        result.AccountCode = account.AccountCode;
        var accountCurrency = account.CurrencyType == "TWD" ? "NTD" : "ZZZ";

        var profile = ResolveProfile(db, account.BankCode, accountCurrency);
        if (profile == null) { result.Error = $"查無格式設定（銀行 {account.BankCode}）"; return result; }
        result.ProfileId = profile.Id;

        try
        {
            var rows = ParserRegistry.GetParser(profile.Engine)(content, profile);
            var (records, errors) = MappingHelper.ApplyMapping(rows, profile, accountCurrency == "NTD" ? "NTD" : null);
            result.Records = records;
            result.Errors = errors;
        }
        catch (Exception e)
        {
            result.Error = e.Message;
        }
        return result;
    }

    /// <summary>轉入單一檔案。回傳該檔結果；不拋例外讓整批中斷。</summary>
    public ImportResult IngestFile(IngestInput input)
    {
        using var db = factory.CreateDbContext();

        ImportResult Fail(string msg, string? accountCode = null, int? profileId = null) => new()
        {
            FileName = input.FileName, AccountCode = accountCode, ProfileId = profileId,
            BalanceDate = input.ScreenBalanceDate, Total = 0, Success = 0, Fail = 1,
            Status = "FAILED", Errors = [new RowError(0, null, msg)],
        };

        // 1. 路由：檔名 → 單一帳號
        var matched = db.BankAccounts.AsNoTracking().Where(a => a.IsActive && a.ImportFileName == input.FileName).ToList();
        if (matched.Count == 0) return Fail("檔名比對不到帳號，請於帳號基本資料設定轉檔檔名或手動指定");
        if (matched.Count > 1) return Fail("檔名命中多個帳號，請手動指定");
        var account = matched[0];
        var accountCurrency = account.CurrencyType == "TWD" ? "NTD" : "ZZZ";

        // 2. 權限：帳號須在操作者可維護範圍
        var accessible = PermissionService.GetAccessibleAccountCodes(db, input.UserId, input.ScreenBalanceDate);
        if (accessible != null && !accessible.Contains(account.AccountCode))
            return Fail("您沒有此帳號的維護權限", account.AccountCode);

        // 3. 解析 profile（銀行＋幣別，ZZZ fallback）
        var profile = ResolveProfile(db, account.BankCode, accountCurrency);
        if (profile == null) return Fail($"查無格式設定（銀行 {account.BankCode}）", account.AccountCode);

        // 4. Parse + Map
        List<NormalizedBalanceRecord> records;
        List<RowError> errors;
        try
        {
            var rows = ParserRegistry.GetParser(profile.Engine)(input.Content, profile);
            (records, errors) = MappingHelper.ApplyMapping(rows, profile, accountCurrency == "NTD" ? "NTD" : null);
        }
        catch (Exception e)
        {
            return Fail(e.Message, account.AccountCode, profile.Id);
        }

        var success = 0;

        // 候選暫收日期（供「已立暫收則擋覆蓋」檢核）：當日(二次) + 次營業日(日常)
        var suspenseDates = new[] { input.ScreenBalanceDate, SuspenseService.NextBusinessDay(db, input.ScreenBalanceDate) };

        using var txn = db.Database.BeginTransaction();
        foreach (var r in records)
        {
            // 檢核：檔內日期須與畫面一致
            if (r.BalanceDate != input.ScreenBalanceDate)
            {
                errors.Add(new RowError(r.SourceRow, "餘額日期", $"檔內日期 {r.BalanceDate} 與畫面餘額日期 {input.ScreenBalanceDate} 不一致"));
                continue;
            }
            // 檢核：檔內帳號（若有）須與路由帳號一致
            if (r.AccountCode.Length > 0 && r.AccountCode != account.AccountCode)
            {
                errors.Add(new RowError(r.SourceRow, "帳號", $"檔內帳號 {r.AccountCode} 與檔名對應帳號 {account.AccountCode} 不一致"));
                continue;
            }

            var maxSeq = db.PassbookBalances
                .Where(p => p.BalanceDate == r.BalanceDate && p.AccountCode == account.AccountCode && p.Currency == r.Currency)
                .Select(p => (int?)p.ImportSeq).Max() ?? 0;

            if (input.SecondImport)
            {
                // 二次轉入：保留前筆，次別 +1
                db.PassbookBalances.Add(NewImport(r, account.AccountCode, maxSeq + 1, input));
                success++;
            }
            else if (maxSeq == 0)
            {
                // 首次轉入
                db.PassbookBalances.Add(NewImport(r, account.AccountCode, 1, input));
                success++;
            }
            else
            {
                // 更正覆蓋：先檢核是否已立暫收
                var hasSuspense = db.SuspenseTransactions.Any(t =>
                    t.AccountCode == account.AccountCode && t.Currency == r.Currency && suspenseDates.Contains(t.SuspenseDate));
                if (hasSuspense)
                {
                    errors.Add(new RowError(r.SourceRow, "立暫收", "該帳號餘額已被立暫收，須先取消立暫收才能重轉"));
                    continue;
                }
                var latest = db.PassbookBalances
                    .Where(p => p.BalanceDate == r.BalanceDate && p.AccountCode == account.AccountCode
                                && p.Currency == r.Currency && p.DataType == BalanceDataTypes.FileImport)
                    .OrderByDescending(p => p.ImportSeq).FirstOrDefault();
                if (latest != null)
                {
                    latest.Balance = r.Balance;
                    latest.FileName = input.FileName;
                    latest.DataType = BalanceDataTypes.FileImport;
                    latest.IsReviewed = false;
                    latest.ReviewedBy = null;
                    latest.ReviewedAt = null;
                    latest.UpdatedBy = input.Operator;
                    latest.UpdatedAt = DateTime.Now;
                }
                else
                {
                    // 既有為手動/前日（非 FILE_IMPORT）：不覆蓋，另開新次別
                    db.PassbookBalances.Add(NewImport(r, account.AccountCode, maxSeq + 1, input));
                }
                success++;
            }
            db.SaveChanges();
        }
        txn.Commit();

        var total = success + errors.Count;
        var status = success == 0 ? "FAILED" : errors.Count > 0 ? "PARTIAL" : "SUCCESS";

        return new ImportResult
        {
            FileName = input.FileName, AccountCode = account.AccountCode, ProfileId = profile.Id,
            BalanceDate = input.ScreenBalanceDate, Total = total, Success = success,
            Fail = errors.Count, Status = status, Errors = errors,
        };
    }

    /// <summary>依「銀行＋幣別」解析有效 profile：先精確幣別、再 ZZZ fallback；取最新版本。</summary>
    private static ParsedProfile? ResolveProfile(AppDbContext db, string bankCode, string currency)
    {
        BankFormatProfile? Pick(string cur) => db.BankFormatProfiles.AsNoTracking()
            .Where(p => p.BankCode == bankCode && p.Currency == cur && p.Status == "ACTIVE")
            .OrderByDescending(p => p.Version).FirstOrDefault();

        var raw = Pick(currency) ?? (currency != "ZZZ" ? Pick("ZZZ") : null);
        return raw == null ? null : ParsedProfile.From(raw);
    }

    private static PassbookBalance NewImport(NormalizedBalanceRecord r, string accountCode, int seq, IngestInput input) => new()
    {
        BalanceDate = r.BalanceDate, AccountCode = accountCode, Currency = r.Currency, Balance = r.Balance,
        DataType = BalanceDataTypes.FileImport, ImportSeq = seq, FileName = input.FileName,
        IsReviewed = false, CreatedBy = input.Operator, UpdatedBy = input.Operator,
    };

    private void WriteLog(string batchId, ImportResult r, string uploadedBy)
    {
        using var db = factory.CreateDbContext();
        db.ImportLogs.Add(new ImportLog
        {
            BatchId = batchId, FileName = r.FileName, AccountCode = r.AccountCode, ProfileId = r.ProfileId,
            BalanceDate = r.BalanceDate, TotalCount = r.Total, SuccessCount = r.Success, FailCount = r.Fail,
            Status = r.Status, Errors = r.Errors.Count > 0 ? JsonSerializer.Serialize(r.Errors) : null,
            UploadedBy = uploadedBy,
        });
        db.SaveChanges();
    }
}
