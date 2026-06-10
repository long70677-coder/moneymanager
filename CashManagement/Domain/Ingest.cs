using System.Text.Json.Serialization;

namespace CashManagement.Domain;

// FUN2.1.1 存摺餘額轉檔 — 領域型別（不依賴其他層）

public static class ParserEngines
{
    public const string Delimited = "DELIMITED";
    public const string FixedWidth = "FIXED_WIDTH"; // Phase 3
    public const string Excel = "EXCEL";            // Phase 3
}

/// <summary>欄位對應：以欄名（by=name）或欄序（by=index，0 起算）取值。</summary>
public class ColumnRef
{
    [JsonPropertyName("by")] public string By { get; set; } = "name";
    [JsonPropertyName("key")] public object? Key { get; set; }

    /// <summary>取 cells 字典用的 key（欄序也以字串存取）。</summary>
    [JsonIgnore] public string CellKey => Key?.ToString() ?? "";
}

public class ColumnMap
{
    [JsonPropertyName("balanceDate")] public ColumnRef? BalanceDate { get; set; }
    [JsonPropertyName("accountCode")] public ColumnRef? AccountCode { get; set; }
    [JsonPropertyName("currency")] public ColumnRef? Currency { get; set; }
    [JsonPropertyName("balance")] public ColumnRef? Balance { get; set; }
}

public class AmountFormat
{
    [JsonPropertyName("thousandsSeparator")] public bool? ThousandsSeparator { get; set; }
    [JsonPropertyName("parenthesesNegative")] public bool? ParenthesesNegative { get; set; }
}

/// <summary>解析後的原始列（字串值；cells 同時以欄名與欄序為 key）。</summary>
public record RawRow(int SourceRow, Dictionary<string, string> Cells);

/// <summary>Map 後的標準餘額記錄（記憶體中繼，不落地）。</summary>
public record NormalizedBalanceRecord(string BalanceDate, string AccountCode, string Currency, decimal Balance, int SourceRow);

/// <summary>逐列錯誤。</summary>
public record RowError(int SourceRow, string? Field, string Message);

/// <summary>單一檔案的轉檔結果。</summary>
public class ImportResult
{
    public string FileName { get; set; } = "";
    public string? AccountCode { get; set; }
    public int? ProfileId { get; set; }
    public string? BalanceDate { get; set; }
    public int Total { get; set; }
    public int Success { get; set; }
    public int Fail { get; set; }
    public string Status { get; set; } = "SUCCESS"; // SUCCESS | PARTIAL | FAILED
    public List<RowError> Errors { get; set; } = [];
}

/// <summary>試轉預覽（dry-run）結果。</summary>
public class PreviewResult
{
    public string FileName { get; set; } = "";
    public string? AccountCode { get; set; }
    public int? ProfileId { get; set; }
    public List<NormalizedBalanceRecord> Records { get; set; } = [];
    public List<RowError> Errors { get; set; } = [];
    public string? Error { get; set; }
}
