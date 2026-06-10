using CashManagement.Data;
using CashManagement.Domain;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>銀行格式設定維護（列表/新增/修改/刪除）。</summary>
public class BankFormatService(IDbContextFactory<AppDbContext> factory)
{
    public List<BankFormatProfile> List()
    {
        using var db = factory.CreateDbContext();
        return db.BankFormatProfiles.AsNoTracking()
            .OrderBy(p => p.BankCode).ThenBy(p => p.Currency).ThenByDescending(p => p.Version)
            .ToList();
    }

    public int Create(BankFormatProfile p)
    {
        Validate(p);
        using var db = factory.CreateDbContext();
        try
        {
            db.BankFormatProfiles.Add(p);
            db.SaveChanges();
            return p.Id;
        }
        catch (DbUpdateException)
        {
            throw new BusinessException("新增失敗（可能銀行+幣別+版本重複）");
        }
    }

    public void Update(BankFormatProfile p)
    {
        Validate(p);
        using var db = factory.CreateDbContext();
        var existing = db.BankFormatProfiles.Find(p.Id)
            ?? throw new BusinessException("查無資料");
        existing.BankCode = p.BankCode;
        existing.Currency = p.Currency;
        existing.ProfileName = p.ProfileName;
        existing.Engine = p.Engine;
        existing.Encoding = p.Encoding;
        existing.Delimiter = p.Delimiter;
        existing.HasHeader = p.HasHeader;
        existing.SkipRows = p.SkipRows;
        existing.ColumnMapJson = p.ColumnMapJson;
        existing.DateFormat = p.DateFormat;
        existing.CurrencyMapJson = p.CurrencyMapJson;
        existing.Version = p.Version;
        existing.EffectiveDate = p.EffectiveDate;
        existing.Status = p.Status;
        existing.UpdatedBy = p.UpdatedBy;
        existing.UpdatedAt = DateTime.Now;
        db.SaveChanges();
    }

    public void Delete(int id)
    {
        using var db = factory.CreateDbContext();
        var changes = db.BankFormatProfiles.Where(p => p.Id == id).ExecuteDelete();
        if (changes == 0) throw new BusinessException("查無資料");
    }

    private static void Validate(BankFormatProfile p)
    {
        if (string.IsNullOrWhiteSpace(p.BankCode)) throw new BusinessException("銀行代碼必填");
        if (string.IsNullOrWhiteSpace(p.Currency)) throw new BusinessException("幣別必填（可用 ZZZ 表共用）");
        if (string.IsNullOrWhiteSpace(p.Engine)) throw new BusinessException("解析引擎必填");
        if (string.IsNullOrWhiteSpace(p.ColumnMapJson) || p.ColumnMapJson == "{}")
            throw new BusinessException("欄位對應至少需設定「餘額日期」與「餘額」");
    }
}
