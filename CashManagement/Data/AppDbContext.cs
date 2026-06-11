using Microsoft.EntityFrameworkCore;

namespace CashManagement.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<BankAccount> BankAccounts => Set<BankAccount>();
    public DbSet<PassbookBalance> PassbookBalances => Set<PassbookBalance>();
    public DbSet<SuspenseTransaction> SuspenseTransactions => Set<SuspenseTransaction>();
    public DbSet<BatchConfirmation> BatchConfirmations => Set<BatchConfirmation>();
    public DbSet<VoucherEntry> VoucherEntries => Set<VoucherEntry>();
    public DbSet<ReportDetail> ReportDetails => Set<ReportDetail>();
    public DbSet<SequenceCounter> SequenceCounters => Set<SequenceCounter>();
    public DbSet<User> Users => Set<User>();
    public DbSet<AccountManager> AccountManagers => Set<AccountManager>();
    public DbSet<Currency> Currencies => Set<Currency>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Holiday> Holidays => Set<Holiday>();
    public DbSet<BankFormatProfile> BankFormatProfiles => Set<BankFormatProfile>();
    public DbSet<ImportLog> ImportLogs => Set<ImportLog>();
    public DbSet<LedgerBalance> LedgerBalances => Set<LedgerBalance>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<BankAccount>().HasIndex(x => x.AccountCode).IsUnique();

        b.Entity<PassbookBalance>()
            .HasIndex(x => new { x.BalanceDate, x.AccountCode, x.Currency, x.ImportSeq }).IsUnique();

        b.Entity<SuspenseTransaction>().HasIndex(x => x.TransactionNo).IsUnique();
        b.Entity<SuspenseTransaction>()
            .HasIndex(x => new { x.SuspenseDate, x.SuspenseType, x.Currency, x.BatchNo, x.AccountCode }).IsUnique();

        b.Entity<BatchConfirmation>()
            .HasIndex(x => new { x.SuspenseDate, x.Currency, x.BatchType, x.BatchNo }).IsUnique();

        b.Entity<SequenceCounter>().HasIndex(x => x.CounterKey).IsUnique();
        b.Entity<User>().HasIndex(x => x.UserCode).IsUnique();

        b.Entity<AccountManager>()
            .HasIndex(x => new { x.AccountCode, x.UserId, x.ManagerType }).IsUnique();

        b.Entity<Currency>().HasIndex(x => x.Code).IsUnique();
        b.Entity<ExchangeRate>().HasIndex(x => new { x.RateDate, x.CurrencyCode }).IsUnique();
        b.Entity<Holiday>().HasIndex(x => x.HolidayDate).IsUnique();

        b.Entity<BankFormatProfile>()
            .HasIndex(x => new { x.BankCode, x.Currency, x.Version }).IsUnique();

        b.Entity<LedgerBalance>()
            .HasIndex(x => new { x.BalanceDate, x.AccountCode, x.Currency }).IsUnique();
    }
}
