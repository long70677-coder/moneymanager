using CashManagement.Data;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services;

/// <summary>
/// 目前操作者（demo 切換器；正式版改為登入）。
/// Blazor Server 每個 circuit 一份（scoped），切換時通知頁面刷新。
/// </summary>
public class CurrentUserState(IDbContextFactory<AppDbContext> factory)
{
    public List<User> Users { get; private set; } = [];
    public User? CurrentUser { get; private set; }

    public event Action? OnChange;

    public void EnsureLoaded()
    {
        if (Users.Count > 0) return;
        using var db = factory.CreateDbContext();
        Users = db.Users.Where(u => u.IsActive) // 停用使用者不可切換
            .OrderByDescending(u => u.Role).ThenBy(u => u.UserCode).ToList();
        CurrentUser ??= Users.FirstOrDefault();
    }

    /// <summary>使用者主檔異動後重載清單（停用/新增/改名）；目前操作者被停用時退回第一位。</summary>
    public void Refresh()
    {
        using var db = factory.CreateDbContext();
        Users = db.Users.Where(u => u.IsActive)
            .OrderByDescending(u => u.Role).ThenBy(u => u.UserCode).ToList();
        CurrentUser = (CurrentUser == null ? null : Users.FirstOrDefault(u => u.Id == CurrentUser.Id))
            ?? Users.FirstOrDefault();
        OnChange?.Invoke();
    }

    public void SwitchUser(int userId)
    {
        var u = Users.FirstOrDefault(x => x.Id == userId);
        if (u == null || u.Id == CurrentUser?.Id) return;
        CurrentUser = u;
        OnChange?.Invoke();
    }
}
