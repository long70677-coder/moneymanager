using System.Text;
using CashManagement.Domain;

namespace CashManagement.Services.Parsing;

/// <summary>
/// 分隔檔解析引擎（DELIMITED）。
/// cells 同時以「欄名」與「欄序(字串)」為 key，讓 column_map 可用 name 或 index 對應。
/// Phase 1 僅支援 UTF-8；Big5 等其他編碼留待後續（System.Text.Encoding.CodePages）。
/// </summary>
public static class DelimitedParser
{
    public static List<RawRow> Parse(byte[] file, ParsedProfile profile)
    {
        var enc = (profile.Encoding ?? "UTF-8").ToUpperInvariant();
        if (enc is not ("UTF-8" or "UTF8" or "ASCII"))
            throw new BusinessException($"暫不支援的編碼 {profile.Encoding}（Phase 1 僅 UTF-8）");

        var text = Encoding.UTF8.GetString(file);
        if (text.Length > 0 && text[0] == '﻿') text = text[1..]; // 去 BOM

        var allLines = text.Split(["\r\n", "\r", "\n"], StringSplitOptions.None);
        var delim = string.IsNullOrEmpty(profile.Delimiter) ? "," : profile.Delimiter;

        var idx = profile.SkipRows;
        string[]? header = null;
        if (profile.HasHeader)
        {
            var hl = idx < allLines.Length ? allLines[idx] : null;
            idx++;
            header = hl?.Split(delim).Select(s => s.Trim()).ToArray() ?? [];
        }

        var rows = new List<RawRow>();
        for (var i = idx; i < allLines.Length; i++)
        {
            var line = allLines[i];
            if (line.Trim().Length == 0) continue; // 略過空行
            var parts = line.Split(delim).Select(s => s.Trim()).ToArray();
            var cells = new Dictionary<string, string>();
            for (var j = 0; j < parts.Length; j++)
            {
                cells[j.ToString()] = parts[j];                       // 以欄序
                if (header != null && j < header.Length) cells[header[j]] = parts[j]; // 以欄名
            }
            rows.Add(new RawRow(i + 1, cells));
        }
        return rows;
    }
}

/// <summary>解析引擎註冊表：依 profile.engine 取得對應 parser。</summary>
public static class ParserRegistry
{
    public static Func<byte[], ParsedProfile, List<RawRow>> GetParser(string engine) => engine switch
    {
        ParserEngines.Delimited => DelimitedParser.Parse,
        _ => throw new BusinessException($"解析引擎 {engine} 尚未支援（目前僅 DELIMITED）"),
    };
}
