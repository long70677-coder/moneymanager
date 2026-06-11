using System.Text;
using CashManagement.Domain;

namespace CashManagement.Services.Parsing;

/// <summary>解析引擎共用：依 profile.Encoding 取得編碼器（容錯解碼，難字以替代字呈現不丟例外）。</summary>
public static class EncodingHelper
{
    public static Encoding Resolve(string? encoding)
    {
        var enc = (encoding ?? "UTF-8").ToUpperInvariant();
        return enc switch
        {
            "UTF-8" or "UTF8" or "ASCII" => Encoding.UTF8,
            "BIG5" or "CP950" or "950" => Encoding.GetEncoding(950),
            _ => throw new BusinessException($"暫不支援的編碼 {encoding}"),
        };
    }
}

/// <summary>
/// 固定寬度（定長）解析引擎（FIXED_WIDTH）。
/// 各欄以「起迄位置（1 起算、含頭含尾、以位元組計）」於每行固定位置切片，再依 profile.Encoding 解碼。
/// 採位元組對齊：中文/全形在 BIG5 佔 2 bytes，唯有按 byte 切片才不會錯位。
/// cells 以「起迄位置字串（如 1-8）」為 key，對應 column_map 的 by="range"。
/// </summary>
public static class FixedWidthParser
{
    public static List<RawRow> Parse(byte[] file, ParsedProfile profile)
    {
        var enc = EncodingHelper.Resolve(profile.Encoding);

        // 收集 column_map 中以 range 定址的欄位
        var refs = new[] { profile.ColumnMap.BalanceDate, profile.ColumnMap.AccountCode, profile.ColumnMap.Currency, profile.ColumnMap.Balance }
            .Where(r => r is { By: "range" } && !string.IsNullOrWhiteSpace(r.CellKey))
            .Select(r => (Key: r!.CellKey, Range: ParseRange(r.CellKey)))
            .ToList();
        if (refs.Count == 0)
            throw new BusinessException("固定寬度設定缺少欄位起迄位置（請於欄位對應填寫，如 1-8）");

        var lines = SplitLines(file);
        var rows = new List<RawRow>();
        for (var i = profile.SkipRows; i < lines.Count; i++)
        {
            var lineBytes = lines[i];
            if (lineBytes.Length == 0) continue; // 略過空行
            var cells = new Dictionary<string, string>();
            foreach (var (key, range) in refs)
                cells[key] = Slice(lineBytes, range.Start, range.Length, enc);
            rows.Add(new RawRow(i + 1, cells));
        }
        return rows;
    }

    /// <summary>解析「起-迄」字串（1 起算、含兩端）→ 0 起算位移與長度。</summary>
    internal static (int Start, int Length) ParseRange(string spec)
    {
        var parts = spec.Split('-', StringSplitOptions.TrimEntries);
        if (parts.Length != 2
            || !int.TryParse(parts[0], out var from) || !int.TryParse(parts[1], out var to)
            || from < 1 || to < from)
            throw new BusinessException($"欄位起迄位置格式錯誤：{spec}（應為「起-迄」，1 起算且起≤迄，如 1-8）");
        return (from - 1, to - from + 1);
    }

    /// <summary>按位元組切片後解碼並 Trim；超出行長則取到行尾（缺位以空字串呈現）。</summary>
    private static string Slice(byte[] line, int start, int length, Encoding enc)
    {
        if (start >= line.Length) return "";
        var take = Math.Min(length, line.Length - start);
        return enc.GetString(line, start, take).Trim();
    }

    /// <summary>以位元組切行（\r\n / \n / \r），保留各行原始位元組。</summary>
    private static List<byte[]> SplitLines(byte[] file)
    {
        // 去 UTF-8 BOM
        var offset = file.Length >= 3 && file[0] == 0xEF && file[1] == 0xBB && file[2] == 0xBF ? 3 : 0;
        var lines = new List<byte[]>();
        var startIdx = offset;
        for (var i = offset; i < file.Length; i++)
        {
            if (file[i] != (byte)'\n' && file[i] != (byte)'\r') continue;
            lines.Add(file[startIdx..i]);
            if (file[i] == (byte)'\r' && i + 1 < file.Length && file[i + 1] == (byte)'\n') i++; // 吞掉 \r\n 的 \n
            startIdx = i + 1;
        }
        if (startIdx < file.Length) lines.Add(file[startIdx..]);
        return lines;
    }
}
