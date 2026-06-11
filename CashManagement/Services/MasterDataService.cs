using CashManagement.Data;
using CashManagement.Domain;
using CashManagement.Services.Master;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>帳號維護權限列（users × bank_accounts join，供畫面/匯出）。</summary>
public class AssignmentRow
{
    public int Id { get; init; }
    public int UserId { get; init; }
    public string UserCode { get; init; } = "";
    public string UserName { get; init; } = "";
    public string AccountCode { get; init; } = "";
    public string? AccountName { get; init; }
    public string ManagerType { get; init; } = "";
    public string? ValidFrom { get; init; }
    public string? ValidTo { get; init; }
    public string UpdatedBy { get; init; } = "";
    public DateTime UpdatedAt { get; init; }
}

/// <summary>
/// 帳號維護權限（主辦/代理指派）維護：主從式主檔，不走泛型框架，但遵循相同規則
/// （主管才可維護、唯一鍵檢核、審計欄位）。一般主檔維護見 MasterMaintenanceService。
/// </summary>
public class MasterDataService(IDbContextFactory<AppDbContext> factory)
{
    public List<AssignmentRow> GetAssignments(int? userId, string? accountCode, string? managerType)
    {
        using var db = factory.CreateDbContext();
        var q = from m in db.AccountManagers.AsNoTracking()
                join u in db.Users.AsNoTracking() on m.UserId equals u.Id
                join ba in db.BankAccounts.AsNoTracking() on m.AccountCode equals ba.AccountCode into g
                from ba in g.DefaultIfEmpty()
                select new { m, u, ba };

        if (userId != null) q = q.Where(x => x.m.UserId == userId);
        if (!string.IsNullOrEmpty(accountCode)) q = q.Where(x => x.m.AccountCode == accountCode);
        if (!string.IsNullOrEmpty(managerType)) q = q.Where(x => x.m.ManagerType == managerType);

        return q.OrderBy(x => x.u.UserCode).ThenBy(x => x.m.AccountCode).ThenByDescending(x => x.m.ManagerType)
            .Select(x => new AssignmentRow
            {
                Id = x.m.Id,
                UserId = x.u.Id,
                UserCode = x.u.UserCode,
                UserName = x.u.UserName,
                AccountCode = x.m.AccountCode,
                AccountName = x.ba != null ? x.ba.AccountName : null,
                ManagerType = x.m.ManagerType,
                ValidFrom = x.m.ValidFrom,
                ValidTo = x.m.ValidTo,
                UpdatedBy = x.m.UpdatedBy,
                UpdatedAt = x.m.UpdatedAt,
            }).ToList();
    }

    /// <summary>指派對象下拉：啟用中的使用者。</summary>
    public List<User> GetActiveUsers()
    {
        using var db = factory.CreateDbContext();
        return db.Users.AsNoTracking().Where(u => u.IsActive)
            .OrderByDescending(u => u.Role).ThenBy(u => u.UserCode).ToList();
    }

    /// <summary>幣別下拉共用：啟用中的幣別（本國幣排前）。匯率頁、暫收/餘額作業的幣別選單皆由此供應。</summary>
    public List<Currency> GetActiveCurrencies()
    {
        using var db = factory.CreateDbContext();
        return db.Currencies.AsNoTracking().Where(c => c.IsActive)
            .OrderByDescending(c => c.CurrencyType).ThenBy(c => c.Code).ToList();
    }

    /// <summary>指派對象下拉：啟用中的帳號。</summary>
    public List<BankAccount> GetActiveAccounts()
    {
        using var db = factory.CreateDbContext();
        return db.BankAccounts.AsNoTracking().Where(a => a.IsActive)
            .OrderBy(a => a.AccountCode).ToList();
    }

    public void CreateAssignment(AccountManager m, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        using var db = factory.CreateDbContext();
        ValidateAssignment(db, m);
        m.CreatedBy = m.UpdatedBy = actor.UserName;
        m.CreatedAt = m.UpdatedAt = DateTime.Now;
        db.AccountManagers.Add(m);
        db.SaveChanges();
    }

    public void UpdateAssignment(AccountManager m, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        using var db = factory.CreateDbContext();
        var existing = db.AccountManagers.Find(m.Id)
            ?? throw new BusinessException("資料已被其他人刪除，請重新查詢");

        existing.UserId = m.UserId;
        existing.AccountCode = m.AccountCode;
        existing.ManagerType = m.ManagerType;
        existing.ValidFrom = m.ValidFrom;
        existing.ValidTo = m.ValidTo;
        ValidateAssignment(db, existing);
        existing.UpdatedBy = actor.UserName;
        existing.UpdatedAt = DateTime.Now;
        db.SaveChanges();
    }

    public void DeleteAssignment(int id, User actor)
    {
        MasterMaintenanceService.RequireManager(actor);
        using var db = factory.CreateDbContext();
        var existing = db.AccountManagers.Find(id);
        if (existing == null) return; // 已被刪除，視為成功
        db.AccountManagers.Remove(existing);
        db.SaveChanges();
    }

    private static void ValidateAssignment(AppDbContext db, AccountManager m)
    {
        if (m.UserId == 0) throw new BusinessException("「使用者」為必填");
        if (string.IsNullOrWhiteSpace(m.AccountCode)) throw new BusinessException("「銀行帳號」為必填");

        var user = db.Users.AsNoTracking().FirstOrDefault(u => u.Id == m.UserId)
            ?? throw new BusinessException("使用者不存在");
        if (!user.IsActive) throw new BusinessException($"使用者 {user.UserCode} 已停用，不可指派");

        var account = db.BankAccounts.AsNoTracking().FirstOrDefault(a => a.AccountCode == m.AccountCode)
            ?? throw new BusinessException("銀行帳號不存在");
        if (!account.IsActive) throw new BusinessException($"帳號 {account.AccountCode} 已停用，不可指派");

        if (m.ManagerType != ManagerTypes.Primary && m.ManagerType != ManagerTypes.Agent)
            throw new BusinessException("維護類型僅限主辦或代理");

        if (m.ManagerType == ManagerTypes.Primary)
        {
            m.ValidFrom = m.ValidTo = null; // 主辦不適用有效期間
        }
        else if (!string.IsNullOrEmpty(m.ValidFrom) && !string.IsNullOrEmpty(m.ValidTo)
                 && string.Compare(m.ValidFrom, m.ValidTo) > 0)
        {
            throw new BusinessException("代理有效期間：起日不可晚於迄日");
        }

        // 唯一鍵：帳號＋使用者＋類型（DB 有 unique index，先查重給友善訊息）
        if (db.AccountManagers.AsNoTracking()
            .Any(x => x.Id != m.Id && x.AccountCode == m.AccountCode && x.UserId == m.UserId && x.ManagerType == m.ManagerType))
            throw new BusinessException($"{user.UserCode} 對帳號 {m.AccountCode} 已有相同類型的指派");
    }
}
