using System.Text;
using CashManagement.Components;
using CashManagement.Data;
using CashManagement.Services;
using CashManagement.Services.Master;
using Microsoft.EntityFrameworkCore;

// 註冊 CodePages 編碼供應器，啟用 BIG5(CP950) 等非 UTF-8 編碼（銀行定長檔常用）
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// EF Core：開發以 SQLite；至公司環境改 appsettings 連線字串並換 UseSqlServer（見 ARCHITECTURE.md §資料庫）
// 注意：不可叫 "data" —— Windows 不分大小寫，會與原始碼資料夾 Data/ 衝突
var dataDir = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
Directory.CreateDirectory(dataDir);
var connStr = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connStr))
    connStr = $"Data Source={Path.Combine(dataDir, "cash.db")}";
builder.Services.AddDbContextFactory<AppDbContext>(opt => opt.UseSqlite(connStr));

// 業務服務（皆無狀態，注入 DbContextFactory）
builder.Services.AddScoped<CurrentUserState>(); // 每個 circuit 一份：目前操作者（demo 切換器）
builder.Services.AddSingleton<PermissionService>();
builder.Services.AddSingleton<SuspenseService>();
builder.Services.AddSingleton<BalanceService>();
builder.Services.AddSingleton<IngestService>();
builder.Services.AddSingleton<BankFormatService>();
builder.Services.AddSingleton<MasterDataService>();
builder.Services.AddSingleton<BankAccountService>(); // URS2.90.202 銀行帳號基本資料
builder.Services.AddSingleton<MasterMaintenanceService>(); // 基本資料維護框架（SD_MASTER_FRAMEWORK.md）

var app = builder.Build();

// 啟動時確保資料庫存在並植入 demo 資料
using (var scope = app.Services.CreateScope())
{
    var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<AppDbContext>>();
    using var db = factory.CreateDbContext();
    db.Database.EnsureCreated();
    DbSeeder.Seed(db);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
