namespace CashManagement.Domain;

/// <summary>業務常數（與資料庫字面值一致，跨層共用）。</summary>
public static class SuspenseTypes
{
    public const string Daily = "DAILY";       // 日常暫收（T-1 比對）
    public const string Manual = "MANUAL";     // 手工暫收（人工輸入）
    public const string Secondary = "SECONDARY"; // 二次暫收（T 日比對）

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [Daily] = "日常暫收",
        [Manual] = "手工暫收",
        [Secondary] = "二次暫收",
    };
}

public static class Roles
{
    public const string Staff = "STAFF";     // 經辦
    public const string Manager = "MANAGER"; // 主管

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [Staff] = "經辦",
        [Manager] = "主管",
    };
}

public static class ManagerTypes
{
    public const string Primary = "PRIMARY"; // 主辦
    public const string Agent = "AGENT";     // 代理
}

public static class BalanceDataTypes
{
    public const string FileImport = "FILE_IMPORT"; // 檔案轉入
    public const string ManualInput = "MANUAL";     // 人工輸入
    public const string PrevDay = "PREV_DAY";       // 前日餘額

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        [FileImport] = "檔案轉入",
        [ManualInput] = "人工輸入",
        [PrevDay] = "前日餘額",
    };
}

public static class ConfirmStatuses
{
    public const string Confirmed = "CONFIRMED";
    public const string Unconfirmed = "UNCONFIRMED";
}

/// <summary>業務規則違反（service 層拋出，UI 層顯示訊息）。</summary>
public class BusinessException(string message) : Exception(message);
