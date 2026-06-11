using System.Linq.Expressions;
using System.Text;
using CashManagement.Data;
using CashManagement.Domain;
using Microsoft.EntityFrameworkCore;

namespace CashManagement.Services.Master;

/// <summary>
/// 基本資料維護泛型服務：查詢（DB 端篩選）/新增/修改/刪除/停用/匯出 CSV。
/// 維護動作限主管（MANAGER）；行為規格見 SD_MASTER_FRAMEWORK.md §4。
/// </summary>
public class MasterMaintenanceService(IDbContextFactory<AppDbContext> factory)
{
    /// <summary>查詢：有值的篩選逐一轉成 IQueryable 條件（Date 欄位以 key__from / key__to 傳區間）。</summary>
    public List<TEntity> Query<TEntity>(MasterDef<TEntity> def, IReadOnlyDictionary<string, string> filters)
        where TEntity : class, new()
    {
        using var db = factory.CreateDbContext();
        IQueryable<TEntity> q = db.Set<TEntity>().AsNoTracking();

        foreach (var f in def.FilterFields)
        {
            if (f.Kind == FieldKind.Date)
            {
                if (Has(filters, f.Key + "__from", out var from))
                    q = q.Where(BuildCompare(f, from, greaterOrEqual: true));
                if (Has(filters, f.Key + "__to", out var to))
                    q = q.Where(BuildCompare(f, to, greaterOrEqual: false));
            }
            else if (Has(filters, f.Key, out var v))
            {
                q = q.Where(BuildPredicate(f, v));
            }
        }
        return q.ToList();
    }

    public void Create<TEntity>(MasterDef<TEntity> def, TEntity entity, User actor)
        where TEntity : class, new()
    {
        RequireManager(actor);
        using var db = factory.CreateDbContext();
        ValidateEntity(db, def, entity, isNew: true);
        StampAudit(entity, actor, isNew: true);
        db.Set<TEntity>().Add(entity);
        db.SaveChanges();
    }

    /// <summary>修改：只回寫可編輯欄位，其餘以資料庫現值為準。</summary>
    public void Update<TEntity>(MasterDef<TEntity> def, TEntity entity, User actor)
        where TEntity : class, new()
    {
        RequireManager(actor);
        using var db = factory.CreateDbContext();
        var id = GetId(entity);
        var existing = db.Set<TEntity>().Find(id)
            ?? throw new BusinessException("資料已被其他人刪除，請重新查詢");

        foreach (var f in def.Fields)
        {
            var prop = f.MemberProperty;
            if (prop == null || !f.Editable || !f.ShowInForm) continue;
            prop.SetValue(existing, prop.GetValue(entity));
        }

        ValidateEntity(db, def, existing, isNew: false);
        StampAudit(existing, actor, isNew: false);
        db.SaveChanges();
    }

    /// <summary>刪除：DeleteBlockReason 有訊息則阻擋（軟刪除主檔提示改用停用）。</summary>
    public void Delete<TEntity>(MasterDef<TEntity> def, int id, User actor)
        where TEntity : class, new()
    {
        RequireManager(actor);
        using var db = factory.CreateDbContext();
        var existing = db.Set<TEntity>().Find(id);
        if (existing == null) return; // 已被刪除，視為成功

        var reason = def.DeleteBlockReason?.Invoke(db, existing);
        if (reason != null)
            throw new BusinessException(reason);

        db.Set<TEntity>().Remove(existing);
        db.SaveChanges();
    }

    /// <summary>停用/啟用（軟刪除開關）；切換後仍跑 Validate 鉤子（例：不可停用最後一位主管）。</summary>
    public void SetActive<TEntity>(MasterDef<TEntity> def, int id, bool active, User actor)
        where TEntity : class, new()
    {
        RequireManager(actor);
        using var db = factory.CreateDbContext();
        var existing = db.Set<TEntity>().Find(id)
            ?? throw new BusinessException("資料已被其他人刪除，請重新查詢");
        if (existing is not ISoftDelete sd)
            throw new BusinessException("此資料不支援停用");

        sd.IsActive = active;
        def.Validate?.Invoke(db, existing, false);
        StampAudit(existing, actor, isNew: false);
        db.SaveChanges();
    }

    /// <summary>匯出 CSV（UTF-8 BOM；ShowInList 欄位；顯示值與列表一致）。</summary>
    public string ExportCsv<TEntity>(MasterDef<TEntity> def, IEnumerable<TEntity> rows)
        where TEntity : class, new()
    {
        var fields = def.ListFields.ToList();
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", fields.Select(f => CsvEscape(f.Label))));
        foreach (var row in rows)
            sb.AppendLine(string.Join(",", fields.Select(f => CsvEscape(f.DisplayValue(row)))));
        return sb.ToString();
    }

    /// <summary>自訂頁（主從式）匯出共用：自組表頭與列。</summary>
    public static string ToCsv(IEnumerable<string> headers, IEnumerable<IEnumerable<string>> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", headers.Select(CsvEscape)));
        foreach (var row in rows)
            sb.AppendLine(string.Join(",", row.Select(CsvEscape)));
        return sb.ToString();
    }

    public static void RequireManager(User? actor)
    {
        if (actor?.Role != Roles.Manager)
            throw new BusinessException("僅主管可維護基本資料");
    }

    // ── 內部 ────────────────────────────────────────────────

    private static void ValidateEntity<TEntity>(AppDbContext db, MasterDef<TEntity> def, TEntity entity, bool isNew)
        where TEntity : class, new()
    {
        foreach (var f in def.FormFields)
        {
            if (!f.Required) continue;
            var v = f.GetValue(entity);
            if (v == null || (v is string s && string.IsNullOrWhiteSpace(s)))
                throw new BusinessException($"「{f.Label}」為必填");
        }

        var keyFields = def.Fields.Where(f => f.InUniqueKey && f.Member != null).ToList();
        if (keyFields.Count > 0)
        {
            IQueryable<TEntity> q = db.Set<TEntity>().AsNoTracking();
            foreach (var f in keyFields)
                q = q.Where(BuildEquals(f, f.GetValue(entity)));
            var id = GetId(entity);
            if (q.AsEnumerable().Any(e => GetId(e) != id))
                throw new BusinessException(def.UniqueKeyMessage
                    ?? $"已存在相同「{string.Join("＋", keyFields.Select(f => f.Label))}」的資料");
        }

        def.Validate?.Invoke(db, entity, isNew);
    }

    private static void StampAudit(object entity, User actor, bool isNew)
    {
        if (entity is not IAuditable a) return;
        var now = DateTime.Now;
        if (isNew)
        {
            a.CreatedBy = actor.UserName;
            a.CreatedAt = now;
        }
        a.UpdatedBy = actor.UserName;
        a.UpdatedAt = now;
    }

    private static int GetId<TEntity>(TEntity entity) where TEntity : class =>
        (int)(typeof(TEntity).GetProperty("Id")!.GetValue(entity) ?? 0);

    private static bool Has(IReadOnlyDictionary<string, string> filters, string key, out string value)
    {
        value = filters.TryGetValue(key, out var v) ? v.Trim() : "";
        return value.Length > 0;
    }

    private static Expression StripConvert(Expression e) =>
        e is UnaryExpression { NodeType: ExpressionType.Convert } u ? u.Operand : e;

    /// <summary>等值/包含篩選（Text=LIKE 包含，其餘等值）。</summary>
    private static Expression<Func<TEntity, bool>> BuildPredicate<TEntity>(MasterField<TEntity> f, string raw)
        where TEntity : class
    {
        var param = f.Member!.Parameters[0];
        var body = StripConvert(f.Member.Body);

        Expression cond = f.Kind switch
        {
            FieldKind.Bool => Expression.Equal(body, Expression.Constant(raw == "true")),
            FieldKind.Select => Expression.Equal(body, Expression.Constant(raw, body.Type)),
            FieldKind.Number => Expression.Equal(body, Expression.Constant(ParseNumber(raw, body.Type), body.Type)),
            _ => Expression.Call(body, nameof(string.Contains), null, Expression.Constant(raw)),
        };
        return Expression.Lambda<Func<TEntity, bool>>(cond, param);
    }

    private static Expression<Func<TEntity, bool>> BuildEquals<TEntity>(MasterField<TEntity> f, object? value)
        where TEntity : class
    {
        var param = f.Member!.Parameters[0];
        var body = StripConvert(f.Member.Body);
        return Expression.Lambda<Func<TEntity, bool>>(
            Expression.Equal(body, Expression.Constant(value, body.Type)), param);
    }

    /// <summary>日期區間（字串比較；EF 可譯為 SQL）。</summary>
    private static Expression<Func<TEntity, bool>> BuildCompare<TEntity>(MasterField<TEntity> f, string value, bool greaterOrEqual)
        where TEntity : class
    {
        var param = f.Member!.Parameters[0];
        var body = StripConvert(f.Member.Body);
        var compare = Expression.Call(
            typeof(string).GetMethod(nameof(string.Compare), [typeof(string), typeof(string)])!,
            body, Expression.Constant(value));
        var cond = greaterOrEqual
            ? Expression.GreaterThanOrEqual(compare, Expression.Constant(0))
            : Expression.LessThanOrEqual(compare, Expression.Constant(0));
        return Expression.Lambda<Func<TEntity, bool>>(cond, param);
    }

    private static object ParseNumber(string raw, Type t)
    {
        t = Nullable.GetUnderlyingType(t) ?? t;
        if (t == typeof(int)) return int.TryParse(raw, out var i) ? i : 0;
        if (t == typeof(decimal)) return decimal.TryParse(raw, out var d) ? d : 0m;
        return 0;
    }

    private static string CsvEscape(string s)
    {
        if (s.Contains(',') || s.Contains('"') || s.Contains('\n') || s.Contains('\r'))
            return '"' + s.Replace("\"", "\"\"") + '"';
        return s;
    }
}
