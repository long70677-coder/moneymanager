using System.Text.RegularExpressions;
using CashManagement.Domain;

namespace CashManagement.Services.Parsing;

/// <summary>Map 階段：原始列 → 標準餘額記錄（日期/金額/幣別正規化）。</summary>
public static partial class MappingHelper
{
    [GeneratedRegex(@"^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})$")]
    private static partial Regex DateRegex();

    private const string FullWidth = "０１２３４５６７８９．，（）－";
    private const string HalfWidth = "0123456789.,()-";

    /// <summary>解析日期 → ISO yyyy-MM-dd。支援西元 YYYY-MM-DD / YYYY/MM/DD 與民國 YYY/MM/DD。</summary>
    public static string? ParseDate(string? raw, string? format)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var m = DateRegex().Match(raw.Trim());
        if (!m.Success) return null;

        var year = int.Parse(m.Groups[1].Value);
        var mon = int.Parse(m.Groups[2].Value);
        var day = int.Parse(m.Groups[3].Value);

        // 民國年判斷：格式明示三位年(YYY 而非 YYYY)、或無格式且年份為 2-3 位、或年份 < 1911
        var fmtRoc = !string.IsNullOrEmpty(format) && format.Contains("YYY") && !format.Contains("YYYY");
        var isRoc = fmtRoc || (string.IsNullOrEmpty(format) && m.Groups[1].Value.Length <= 3) || year < 1911;
        if (isRoc) year += 1911;

        if (mon is < 1 or > 12 || day is < 1 or > 31) return null;
        return $"{year:0000}-{mon:00}-{day:00}";
    }

    /// <summary>解析金額 → decimal。去千分位、全形數字、括號負號。</summary>
    public static decimal? ParseAmount(string? raw, AmountFormat? fmt)
    {
        if (raw == null) return null;
        var v = raw.Trim();
        if (v.Length == 0) return null;

        // 全形 → 半形
        var chars = v.Select(c =>
        {
            var idx = FullWidth.IndexOf(c);
            return idx >= 0 ? HalfWidth[idx] : c;
        });
        v = new string(chars.ToArray());

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
