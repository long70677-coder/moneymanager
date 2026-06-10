using System.Text.Json;
using CashManagement.Data;
using CashManagement.Domain;

namespace CashManagement.Services.Parsing;

/// <summary>BankFormatProfile 的解析後形態（JSON 欄位已反序列化），供解析引擎使用。</summary>
public class ParsedProfile
{
    public int Id { get; init; }
    public string BankCode { get; init; } = "";
    public string Currency { get; init; } = "";
    public string Engine { get; init; } = ParserEngines.Delimited;
    public string Encoding { get; init; } = "UTF-8";
    public string Delimiter { get; init; } = ",";
    public bool HasHeader { get; init; } = true;
    public int SkipRows { get; init; }
    public ColumnMap ColumnMap { get; init; } = new();
    public string? DateFormat { get; init; }
    public AmountFormat? AmountFormat { get; init; }
    public Dictionary<string, string>? CurrencyMap { get; init; }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public static ParsedProfile From(BankFormatProfile p) => new()
    {
        Id = p.Id,
        BankCode = p.BankCode,
        Currency = p.Currency,
        Engine = p.Engine,
        Encoding = p.Encoding,
        Delimiter = p.Delimiter,
        HasHeader = p.HasHeader,
        SkipRows = p.SkipRows,
        ColumnMap = JsonSerializer.Deserialize<ColumnMap>(p.ColumnMapJson, JsonOpts) ?? new ColumnMap(),
        DateFormat = p.DateFormat,
        AmountFormat = string.IsNullOrEmpty(p.AmountFormatJson)
            ? null : JsonSerializer.Deserialize<AmountFormat>(p.AmountFormatJson, JsonOpts),
        CurrencyMap = string.IsNullOrEmpty(p.CurrencyMapJson)
            ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(p.CurrencyMapJson, JsonOpts),
    };
}
