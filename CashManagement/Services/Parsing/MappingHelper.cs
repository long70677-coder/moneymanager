using System.Text.RegularExpressions;
using CashManagement.Domain;

namespace CashManagement.Services.Parsing;

/// <summary>Map 階段：原始列 → 標準餘額記錄（日期/金額/幣別正規化）。</summary>
public static partial class MappingHelper
{
    [GeneratedRegex(@"^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})$")]
    private static partial Regex DateRegex();

    [GeneratedRegex(@"^\d{6,8}$")]
    private static partial Regex CompactDateRegex();

    private const string FullWidth = "０１２３４５６７８９．，（）－／";
    private const string HalfWidth = "0123456789.,()-/";

    /// <summary>全形數字/符號 → 半形。</summary>
    private static string ToHalfWidth(string v) => new(v.Select(c =>
    {
        var idx = FullWidth.IndexOf(c);
        return idx >= 0 ? HalfWidth[idx] : c;
    }).ToArray());

    /// <summary>
    /// 解析日期 → ISO yyyy-MM-dd。支援：
    /// 有分隔符 西元 YYYY-MM-DD / YYYY/MM/DD、民國 YYY/MM/DD；
    /// 緊湊無分隔符 YYYYMMDD(8碼西元) / YYYMMDD(7碼民國) / YYMMDD(6碼民國)。
    /// </summary>
    public static string? ParseDate(string? raw, string? format)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var s = ToHalfWidth(raw.Trim());

        // 格式明示三位年(YYY 而非 YYYY) → 民國
        var fmtRoc = !string.IsNullOrEmpty(format) && format.Contains("YYY") && !format.Contains("YYYY");

        int year, mon, day;
        var m = DateRegex().Match(s);
        if (m.Success)
        {
            year = int.Parse(m.Groups[1].Value);
            mon = int.Parse(m.Groups[2].Value);
            day = int.Parse(m.Groups[3].Value);
            var isRoc = fmtRoc || (string.IsNullOrEmpty(format) && m.Groups[1].Value.Length <= 3) || year < 1911;
            if (isRoc) year += 1911;
        }
        else if (CompactDateRegex().IsMatch(s))
        {
            // 緊湊格式：末 4 碼固定為 MMDD，其餘為年（8碼→西元、7/6碼→民國）
            var yLen = s.Length - 4;
            year = int.Parse(s[..yLen]);
            mon = int.Parse(s.Substring(yLen, 2));
            day = int.Parse(s.Substring(yLen + 2, 2));
            if (fmtRoc || yLen < 4 || year < 1911) year += 1911;
        }
        else return null;

        if (mon is < 1 or > 12 || day is < 1 or > 31) return null;
        return $"{year:0000}-{mon:00}-{day:00}";
    }

    /// <summary>解析金額 → decimal。去千分位、全形數字、括號負號。</summary>
    public static decimal? ParseAmount(string? raw, AmountFormat? fmt)
    {
        if (raw == null) return null;
        var v = ToHalfWidth(raw.Trim());
        if (v.Length == 0) return null;

        var negative = false;
        if (fmt?.ParenthesesNegative != false && v.StartsWith('(') && v.EndsWith(')'))
        {
            negative = true;
            v = v[1..^1];
        }
        if (v.StartsWith('-')) { negative = true; v = v[1..]; }
        v = v.Replace(",", "");

        if (!Regex.IsMatch(v, @"^\d*\.?\d+$")) return null;
        if (!decimal.TryParse(v, out var n)) return null;
        return negative ? -n : n;
    }

    /// <summary>
    /// 依 profile 的欄位對應，將原始列轉為標準餘額記錄。
    /// defaultCurrency：檔案無幣別欄時採用（例：台幣帳號 NTD）。
    /// </summary>
    public static (List<NormalizedBalanceRecord> Records, List<RowError> Errors) ApplyMapping(
        List<RawRow> rows, ParsedProfile profile, string? defaultCurrency)
    {
        var cm = profile.ColumnMap;
        var records = new List<NormalizedBalanceRecord>();
        var errors = new List<RowError>();

        foreach (var row in rows)
        {
            var rawDate = ReadCell(row.Cells, cm.BalanceDate);
            var rawBalance = ReadCell(row.Cells, cm.Balance);
            var rawCurrency = ReadCell(row.Cells, cm.Currency);
            var rawAccount = ReadCell(row.Cells, cm.AccountCode);

            var balanceDate = ParseDate(rawDate, profile.DateFormat);
            if (balanceDate == null) { errors.Add(new RowError(row.SourceRow, "餘額日期", $"日期無法解析：{rawDate}")); continue; }

            var balance = ParseAmount(rawBalance, profile.AmountFormat);
            if (balance == null) { errors.Add(new RowError(row.SourceRow, "餘額", $"金額無法解析：{rawBalance}")); continue; }

            var currency = (rawCurrency ?? defaultCurrency ?? "").Trim();
            if (profile.CurrencyMap != null && currency.Length > 0 && profile.CurrencyMap.TryGetValue(currency, out var mapped))
                currency = mapped;
            if (currency.Length == 0) { errors.Add(new RowError(row.SourceRow, "幣別", "幣別未提供")); continue; }

            records.Add(new NormalizedBalanceRecord(balanceDate, (rawAccount ?? "").Trim(), currency, balance.Value, row.SourceRow));
        }

        return (records, errors);
    }

    private static string? ReadCell(Dictionary<string, string> cells, ColumnRef? cref)
    {
        if (cref == null) return null;
        return cells.GetValueOrDefault(cref.CellKey);
    }
}
