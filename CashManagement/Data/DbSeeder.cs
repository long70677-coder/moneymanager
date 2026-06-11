using System.Text.Json;

namespace CashManagement.Data;

/// <summary>Demo 資料植入（idempotent，比照原型 suspense-app 的 seed）。</summary>
public static class DbSeeder
{
    public static void Seed(AppDbContext db)
    {
        if (!db.Users.Any())
        {
            var u1 = new User { UserCode = "U001", UserName = "王小明", Role = "STAFF" };
            var u2 = new User { UserCode = "U002", UserName = "李美華", Role = "STAFF" };
            var u3 = new User { UserCode = "U003", UserName = "陳主管", Role = "MANAGER" };
            db.Users.AddRange(u1, u2, u3);
            db.SaveChanges();

            db.AccountManagers.AddRange(
                new AccountManager { AccountCode = "ACT-001", UserId = u1.Id, ManagerType = "PRIMARY" },
                new AccountManager { AccountCode = "ACT-002", UserId = u1.Id, ManagerType = "PRIMARY" },
                new AccountManager { AccountCode = "ACT-089", UserId = u2.Id, ManagerType = "PRIMARY" },
                new AccountManager { AccountCode = "ACT-102", UserId = u2.Id, ManagerType = "PRIMARY" },
                new AccountManager { AccountCode = "ACT-103", UserId = u2.Id, ManagerType = "PRIMARY" },
                // 代理：王小明代理李美華的 ACT-089（限期）
                new AccountManager { AccountCode = "ACT-089", UserId = u1.Id, ManagerType = "AGENT", ValidFrom = "2023-10-01", ValidTo = "2023-12-31" });
            db.SaveChanges();
        }

        if (!db.BankAccounts.Any())
        {
            db.BankAccounts.AddRange(
                Acc("ACT-001", "012-0001-00001-001", "012", "台幣暫收帳戶A", "General Suspense", false, "TWD"),
                Acc("ACT-002", "012-0001-00001-002", "012", "台幣暫收帳戶B", "Settlement Suspense", false, "TWD"),
                Acc("ACT-089", "013-0089-00089-001", "013", "清算差額暫收帳戶", "Clearing Discrepancy", false, "TWD"),
                Acc("ACT-102", "012-0102-00102-001", "012", "外幣匯款暫收帳戶", "Foreign Remittance", false, "FOREIGN"),
                Acc("ACT-103", "012-0103-00103-001", "012", "外幣保單暫收帳戶", "Foreign Policy Suspense", true, "FOREIGN"));

            db.PassbookBalances.AddRange(
                Pb("2023-10-26", "ACT-001", "NTD", 1250000),
                Pb("2023-10-26", "ACT-002", "NTD", 3500000),
                Pb("2023-10-26", "ACT-089", "NTD", 500000),
                Pb("2023-10-26", "ACT-102", "USD", 25000),
                Pb("2023-10-26", "ACT-103", "USD", 10000));

            db.SuspenseTransactions.AddRange(
                Tx("ST-20231027-001-001", "2023-10-27", "DAILY", "20231027001", "012", "ACT-001", "NTD", 1250000, 1250000, 1250000, 1250000, 0, 1, "J.Smith"),
                Tx("ST-20231027-001-002", "2023-10-27", "MANUAL", "20231027001", "013", "ACT-089", "NTD", 500000, 500000, 450000, 500000, 50000, 1, "M.Chen"),
                Tx("ST-20231027-001-003", "2023-10-27", "DAILY", "20231027001", "012", "ACT-102", "USD", 25000, 25000, 25000, 25000, 0, 31.5m, "System"));

            db.BatchConfirmations.Add(new BatchConfirmation
            {
                SuspenseDate = "2023-10-27", Currency = "NTD", BatchType = "DAILY",
                BatchNo = "20231027001", ConfirmStatus = "UNCONFIRMED",
            });

            db.SequenceCounters.Add(new SequenceCounter { CounterKey = "BATCH_DAILY_20231027_NTD", CurrentValue = 1 });
            db.SaveChanges();
        }

        if (!db.Banks.Any())
        {
            db.Banks.AddRange(
                new Bank { HeadOfficeCode = "012", BankCode = "012", ShortName = "第一銀行" },
                new Bank { HeadOfficeCode = "013", BankCode = "013", ShortName = "華南銀行" });
            db.SaveChanges();
        }

        if (!db.CodeMaps.Any())
        {
            db.CodeMaps.AddRange(
                Code("DEPOSIT_TYPE", "1", "活存"), Code("DEPOSIT_TYPE", "2", "支存"), Code("DEPOSIT_TYPE", "3", "綜存"),
                Code("LEDGER_TYPE", "1", "不分紅"), Code("LEDGER_TYPE", "2", "分紅"), Code("LEDGER_TYPE", "3", "利變"), Code("LEDGER_TYPE", "4", "OIU"),
                Code("CURRENCY_TYPE", "TWD", "台幣"), Code("CURRENCY_TYPE", "FOREIGN", "外幣"),
                Code("FX_ACCOUNT_TYPE", "1", "一般帳戶"), Code("FX_ACCOUNT_TYPE", "2", "外幣保單"), Code("FX_ACCOUNT_TYPE", "3", "OIU"),
                Code("INTEREST_PAYOUT", "1", "年領"), Code("INTEREST_PAYOUT", "2", "半年領"), Code("INTEREST_PAYOUT", "3", "季領"),
                Code("INTEREST_PAYOUT", "4", "月領"), Code("INTEREST_PAYOUT", "5", "無"),
                Code("INTEREST_DAYS", "1", "360天"), Code("INTEREST_DAYS", "2", "365天"));
            db.SaveChanges();
        }

        if (!db.Currencies.Any())
        {
            db.Currencies.AddRange(
                new Currency { Code = "NTD", Name = "新台幣", CurrencyType = "TWD", DecimalPlaces = 0 },
                new Currency { Code = "USD", Name = "美元" },
                new Currency { Code = "EUR", Name = "歐元" },
                new Currency { Code = "JPY", Name = "日圓", DecimalPlaces = 0 });

            // 匯率沿用 demo 交易既有值（USD 31.5），日期早於 demo 交易日使「以前最近一筆」查得到
            db.ExchangeRates.AddRange(
                new ExchangeRate { RateDate = "2023-10-01", CurrencyCode = "USD", Rate = 31.5m },
                new ExchangeRate { RateDate = "2023-10-01", CurrencyCode = "EUR", Rate = 34.2m },
                new ExchangeRate { RateDate = "2023-10-01", CurrencyCode = "JPY", Rate = 0.215m });

            db.Holidays.AddRange(
                new Holiday { HolidayDate = "2026-01-01", Name = "元旦" },
                new Holiday { HolidayDate = "2026-02-28", Name = "和平紀念日" });
            db.SaveChanges();
        }

        // 帳號轉檔檔名：缺者補（demo 以「帳號短碼.csv」）
        foreach (var a in db.BankAccounts.Where(a => a.ImportFileName == null))
            a.ImportFileName = a.AccountCode + ".csv";
        db.SaveChanges();

        if (!db.BankFormatProfiles.Any())
        {
            var columnMap = JsonSerializer.Serialize(new
            {
                balanceDate = new { by = "name", key = "餘額日期" },
                accountCode = new { by = "name", key = "帳號" },
                currency = new { by = "name", key = "幣別" },
                balance = new { by = "name", key = "餘額" },
            });
            db.BankFormatProfiles.AddRange(
                Profile("012", "NTD", "第一銀行 台幣餘額檔", columnMap),
                Profile("013", "NTD", "華南銀行 台幣餘額檔", columnMap),
                Profile("012", "ZZZ", "第一銀行 外幣餘額檔（共用）", columnMap));
            db.SaveChanges();
        }

        // 帳列餘額（結帳流程未實作前的測試資料；含 FUN2.1.1 測試文件用的 2025-03-03）
        if (!db.LedgerBalances.Any())
        {
            db.LedgerBalances.AddRange(
                Ledger("2023-10-26", "ACT-001", "NTD", 1250000),
                Ledger("2023-10-26", "ACT-002", "NTD", 3450000),
                Ledger("2023-10-26", "ACT-089", "NTD", 500000),
                Ledger("2025-03-03", "ACT-001", "NTD", 2000000),
                Ledger("2025-03-03", "ACT-002", "NTD", 5000000));
            db.SaveChanges();
        }
    }

    private static int codeSeq;
    private static CodeMapEntry Code(string category, string code, string label) =>
        new() { Category = category, Code = code, Label = label, SortOrder = ++codeSeq };

    private static int subjectSeq = 10000;

    private static BankAccount Acc(string code, string longCode, string bank, string name, string purpose, bool policy, string curType) =>
        new()
        {
            AccountCode = code, AccountLongCode = longCode, BankCode = bank, AccountName = name,
            AccountPurpose = purpose, IsSuspense = true, IsPolicyAccount = policy, CurrencyType = curType,
            // URS2.90.202 欄位（demo 值）
            SortOrder = subjectSeq - 9999, SubjectCode = (++subjectSeq).ToString(),
            DepositType = "1", LedgerType = "1",
            CurrencyCode = curType == "TWD" ? "NTD" : "USD",
            FxAccountType = curType == "TWD" ? null : (policy ? "2" : "1"),
            BookingCurrency = policy && curType != "TWD" ? "USD" : "NTD",
            OpenDate = "2020-01-01",
        };

    private static PassbookBalance Pb(string date, string code, string cur, decimal bal) =>
        new() { BalanceDate = date, AccountCode = code, Currency = cur, Balance = bal, DataType = "FILE_IMPORT", IsReviewed = true, ReviewedBy = "Admin", ReviewedAt = DateTime.Now };

    private static SuspenseTransaction Tx(string txNo, string date, string type, string batch, string bank, string code, string cur,
        decimal prevComp, decimal prevPass, decimal todayComp, decimal todayPass, decimal amount, decimal rate, string by) =>
        new()
        {
            TransactionNo = txNo, SuspenseDate = date, SuspenseType = type, BatchNo = batch, BankCode = bank,
            AccountCode = code, Currency = cur,
            PrevCompanyBalance = prevComp, PrevPassbookBalance = prevPass,
            TodayCompanyBalance = todayComp, TodayPassbookBalance = todayPass,
            TotalSuspenseAmount = amount, SuspenseAmount = amount, ExchangeRate = rate,
            SuspenseAmountLocal = amount * rate, UpdatedBy = by,
        };

    private static BankFormatProfile Profile(string bank, string cur, string name, string columnMap) =>
        new()
        {
            BankCode = bank, Currency = cur, ProfileName = name, Engine = "DELIMITED",
            Encoding = "UTF-8", Delimiter = ",", HasHeader = true, SkipRows = 0,
            ColumnMapJson = columnMap, DateFormat = "YYYY-MM-DD", Status = "ACTIVE",
        };

    private static LedgerBalance Ledger(string date, string code, string cur, decimal bal) =>
        new() { BalanceDate = date, AccountCode = code, Currency = cur, Balance = bal, IsClosed = true, ClosedAt = DateTime.Now };
}
