using CashManagement.Data;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>
/// 權限判斷的唯一接縫：未來導入 RBAC（ID→GROUP→GROUP authority）時只改此處。
/// </summary>
public class PermissionService(IDbContextFactory<AppDbContext> factory)
{
    /// <summary>
    /// 取得使用者可存取的帳號短碼清單。
    /// 主管回傳 null（不過濾）；經辦回傳於 refDate 有效的主辦/代理帳號；查無使用者回傳空集合。
    /// </summary>
    public List<string>? GetAccessibleAccountCodes(int userId, string? refDate = null)
    {
        using var db = factory.CreateDbContext();
        return GetAccessibleAccountCodes(db, userId, refDate);
    }

    public static List<string>? GetAccessibleAccountCodes(AppDbContext db, int userId, string? refDate = null)
    {
        var user = db.Users.AsNoTracking().FirstOrDefault(u => u.Id == userId);
        if (user == null) return [];
        if (user.Role == "MANAGER") return null;

        var refD = string.IsNullOrEmpty(refDate) ? DateTime.Today.ToString("yyyy-MM-dd") : refDate;
        return db.AccountManagers.AsNoTracking()
            .Where(m => m.UserId == userId
                        && (m.ValidFrom == null || string.Compare(m.ValidFrom, refD) <= 0)
                        && (m.ValidTo == null || string.Compare(m.ValidTo, refD) >= 0))
            .Select(m => m.AccountCode)
            .Distinct()
            .ToList();
    }
}
