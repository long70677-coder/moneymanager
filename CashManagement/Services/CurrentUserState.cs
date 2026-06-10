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
        Users = db.Users.OrderByDescending(u => u.Role).ThenBy(u => u.UserCode).ToList();
        CurrentUser ??= Users.FirstOrDefault();
    }

    public void SwitchUser(int userId)
    {
        var u = Users.FirstOrDefault(x => x.Id == userId);
        if (u == null || u.Id == CurrentUser?.Id) return;
        CurrentUser = u;
        OnChange?.Invoke();
    }
}
