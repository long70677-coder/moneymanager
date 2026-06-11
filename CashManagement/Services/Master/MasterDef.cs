using System.Linq.Expressions;
using System.Reflection;
using CashManagement.Data;

namespace CashManagement.Services.Master;

/// <summary>欄位型別：決定篩選控制項、表單控制項與篩選語意（見 SD_MASTER_FRAMEWORK.md §3.1）。</summary>
public enum FieldKind
{
    Text,    // 文字：篩選=包含
    Number,  // 數字：篩選=等值
    Bool,    // 是否：篩選=下拉 全部/是/否
    Select,  // 代碼：篩選=下拉 Options
    Date,    // 日期字串 yyyy-MM-dd：篩選=起迄區間
}

/// <summary>
/// 基本資料欄位定義。一個 Member 表達式同時驅動：列表取值、篩選（rebase 進 IQueryable）、
/// 表單寫回（反射 setter）與排序。計算欄位用 Get（僅顯示）。
/// </summary>
public class MasterField<TEntity> where TEntity : class
{
    public required string Key { get; init; }
    public required string Label { get; init; }
    public FieldKind Kind { get; init; } = FieldKind.Text;

    public Expression<Func<TEntity, object?>>? Member { get; init; }
    public Func<TEntity, object?>? Get { get; init; }   // 計算欄位（不可篩選/編輯）

    public bool Required { get; init; }
    public bool InUniqueKey { get; init; }
    public bool Editable { get; init; } = true;          // 修改模式可否輸入
    public bool EditableOnCreate { get; init; } = true;  // 新增模式可否輸入
    public bool ShowInList { get; init; } = true;
    public bool ShowInForm { get; init; } = true;
    public bool Filterable { get; init; } = true;
    public bool Mono { get; init; }                      // 列表等寬字（代碼/帳號）
    public (string Value, string Label)[]? Options { get; init; }
    public string? Placeholder { get; init; }
    public string? FormHint { get; init; }

    private Func<TEntity, object?>? compiledGetter;
    private PropertyInfo? memberProp;

    /// <summary>列表/匯出取值。</summary>
    public object? GetValue(TEntity e)
    {
        if (Get != null) return Get(e);
        if (Member == null) return null;
        compiledGetter ??= Member.Compile();
        return compiledGetter(e);
    }

    /// <summary>Member 對應的屬性（表單寫回用）；非單純屬性表達式回傳 null。</summary>
    public PropertyInfo? MemberProperty
    {
        get
        {
            if (memberProp != null) return memberProp;
            if (Member == null) return null;
            var body = Member.Body is UnaryExpression { NodeType: ExpressionType.Convert } u ? u.Operand : Member.Body;
            memberProp = (body as MemberExpression)?.Member as PropertyInfo;
            return memberProp;
        }
    }

    /// <summary>顯示字串（列表/匯出共用）：Bool→是/否、Select→標籤。</summary>
    public string DisplayValue(TEntity e)
    {
        var v = GetValue(e);
        return v switch
        {
            null => "",
            bool b => b ? "是" : "否",
            string s when Options != null => Options.FirstOrDefault(o => o.Value == s).Label ?? s,
            _ => v.ToString() ?? "",
        };
    }
}

/// <summary>主檔維護定義：欄位 + 業務鉤子。</summary>
public class MasterDef<TEntity> where TEntity : class, new()
{
    public required string Title { get; init; }
    public required string Icon { get; init; }
    public required string ExportName { get; init; }
    public required List<MasterField<TEntity>> Fields { get; init; }

    public string? UniqueKeyMessage { get; init; }

    /// <summary>業務驗證鉤子（必填/唯一鍵之外的規則；違反時丟 BusinessException）。isNew=新增。</summary>
    public Action<AppDbContext, TEntity, bool>? Validate { get; init; }

    /// <summary>刪除前檢查：回傳 null=可實體刪除；回傳訊息=阻擋（提示改用停用）。</summary>
    public Func<AppDbContext, TEntity, string?>? DeleteBlockReason { get; init; }

    public IEnumerable<MasterField<TEntity>> ListFields => Fields.Where(f => f.ShowInList);
    public IEnumerable<MasterField<TEntity>> FormFields => Fields.Where(f => f.ShowInForm);
    public IEnumerable<MasterField<TEntity>> FilterFields => Fields.Where(f => f.Filterable && f.Member != null);
}
