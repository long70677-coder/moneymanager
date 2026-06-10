using CashManagement.Data;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>使用者＋其可維護帳號（供基本資料畫面）。</summary>
public class UserWithAccounts
{
    public required User User { get; init; }
    public List<ManagedAccountView> Accounts { get; init; } = [];
}

public class ManagedAccountView
{
    public string AccountCode { get; init; } = "";
    public string? AccountName { get; init; }
    public string ManagerType { get; init; } = "";
    public string? ValidFrom { get; init; }
    public string? ValidTo { get; init; }
}

/// <summary>基本資料查詢（銀行帳號 + 使用者權限；目前唯讀檢視）。</summary>
public class MasterDataService(IDbContextFactory<AppDbContext> factory)
{
    public List<BankAccount> GetAccounts()
    {
        using var db = factory.CreateDbContext();
        return db.BankAccounts.AsNoTracking().OrderBy(a => a.AccountCode).ToList();
    }

    public List<UserWithAccounts> GetUsersWithAccounts()
    {
        using var db = factory.CreateDbContext();
        var users = db.Users.AsNoTracking().OrderByDescending(u => u.Role).ThenBy(u => u.UserCode).ToList();

        return users.Select(u => new UserWithAccounts
        {
            User = u,
            Accounts = u.Role == "MANAGER"
                ? []
                : (from m in db.AccountManagers.AsNoTracking()
                   join ba in db.BankAccounts.AsNoTracking() on m.AccountCode equals ba.AccountCode into g
                   from ba in g.DefaultIfEmpty()
                   where m.UserId == u.Id
                   orderby m.ManagerType descending, m.AccountCode
                   select new ManagedAccountView
                   {
                       AccountCode = m.AccountCode,
                       AccountName = ba != null ? ba.AccountName : null,
                       ManagerType = m.ManagerType,
                       ValidFrom = m.ValidFrom,
                       ValidTo = m.ValidTo,
                   }).ToList(),
        }).ToList();
    }
}
