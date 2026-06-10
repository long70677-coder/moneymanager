"use client";

import { useEffect, useState, useCallback } from "react";
import { PageShell, PageHeader, Card, CardHeader, Btn, Toast, EmptyState } from "@/components/ui";

type ColRef = { by: "name" | "index"; key: string };
interface FormState {
  id: number | null;
  bank_code: string;
  currency: string;
  profile_name: string;
  engine: string;
  encoding: string;
  delimiter: string;
  has_header: boolean;
  skip_rows: number;
  date_format: string;
  status: string;
  version: number;
  cm: { balanceDate: ColRef; accountCode: ColRef; currency: ColRef; balance: ColRef };
}

const EMPTY: FormState = {
  id: null, bank_code: "", currency: "", profile_name: "", engine: "DELIMITED",
  encoding: "UTF-8", delimiter: ",", has_header: true, skip_rows: 0, date_format: "YYYY-MM-DD",
  status: "ACTIVE", version: 1,
  cm: {
    balanceDate: { by: "name", key: "餘額日期" },
    accountCode: { by: "name", key: "帳號" },
    currency: { by: "name", key: "幣別" },
    balance: { by: "name", key: "餘額" },
  },
};

interface Profile {
  id: number; bank_code: string; currency: string; profile_name: string | null;
  engine: string; encoding: string; delimiter: string; date_format: string | null;
  status: string; column_map: Record<string, ColRef>;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "啟用", cls: "bg-[#DCFCE7] text-[#166534]" },
  DRAFT: { label: "草稿", cls: "bg-[#fef3c7] text-[#b45309]" },
  RETIRED: { label: "停用", cls: "bg-[#eef0f4] text-[#7a7d85]" },
};

export default function BankFormatsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);

  const show = (t: "ok" | "err", m: string) => { setMsg({ t, m }); setTimeout(() => setMsg(null), 5000); };

  const load = useCallback(async () => {
    const res = await fetch("/api/bank-formats");
    const data = await res.json();
    setProfiles(data.profiles || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const edit = (p: Profile) => {
    const cm = p.column_map || {};
    setForm({
      id: p.id, bank_code: p.bank_code, currency: p.currency, profile_name: p.profile_name || "",
      engine: p.engine, encoding: p.encoding, delimiter: p.delimiter, has_header: true,
      skip_rows: 0, date_format: p.date_format || "YYYY-MM-DD", status: p.status, version: 1,
      cm: {
        balanceDate: cm.balanceDate || EMPTY.cm.balanceDate,
        accountCode: cm.accountCode || EMPTY.cm.accountCode,
        currency: cm.currency || EMPTY.cm.currency,
        balance: cm.balance || EMPTY.cm.balance,
      },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    const payload = {
      id: form.id ?? undefined, bank_code: form.bank_code, currency: form.currency,
      profile_name: form.profile_name, engine: form.engine, encoding: form.encoding,
      delimiter: form.delimiter, has_header: form.has_header, skip_rows: Number(form.skip_rows),
      date_format: form.date_format, status: form.status, version: form.version,
      column_map: {
        balanceDate: normRef(form.cm.balanceDate),
        accountCode: normRef(form.cm.accountCode),
        currency: normRef(form.cm.currency),
        balance: normRef(form.cm.balance),
      },
    };
    const res = await fetch("/api/bank-formats", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { show("err", data.error); return; }
    show("ok", data.message);
    setForm(EMPTY);
    await load();
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此格式設定？")) return;
    const res = await fetch(`/api/bank-formats?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { show("err", data.error); return; }
    show("ok", data.message);
    if (form.id === id) setForm(EMPTY);
    await load();
  };

  const setCm = (field: keyof FormState["cm"], patch: Partial<ColRef>) =>
    setForm(f => ({ ...f, cm: { ...f.cm, [field]: { ...f.cm[field], ...patch } } }));

  return (
    <PageShell>
      <PageHeader
        group="設定維護"
        title="銀行格式設定"
        description="設定各銀行餘額檔的解析方式（鍵＝銀行＋幣別，幣別可用 ZZZ 表共用）。新增銀行或調整格式於此維護，不需改程式。"
      />

      {msg && <Toast type={msg.t === "ok" ? "success" : "error"} text={msg.m} onClose={() => setMsg(null)} />}

      {/* 編輯表單 */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={form.id ? "edit" : "add_circle"}
          title={form.id ? `編輯設定 #${form.id}` : "新增格式設定"}
          right={form.id ? <span className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] px-2.5 py-1 rounded-full">編輯模式</span> : undefined}
        />
        <div className="p-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="銀行代碼"><input value={form.bank_code} onChange={e => setForm(f => ({ ...f, bank_code: e.target.value }))} className={inp} placeholder="例：012" /></Field>
            <Field label="幣別 (或 ZZZ)"><input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={inp} placeholder="NTD / ZZZ" /></Field>
            <Field label="設定名稱"><input value={form.profile_name} onChange={e => setForm(f => ({ ...f, profile_name: e.target.value }))} className={inp} placeholder="例：台北富邦 台幣" /></Field>
            <Field label="狀態">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                <option value="ACTIVE">啟用</option><option value="DRAFT">草稿</option><option value="RETIRED">停用</option>
              </select>
            </Field>
            <Field label="解析引擎">
              <select value={form.engine} onChange={e => setForm(f => ({ ...f, engine: e.target.value }))} className={inp}>
                <option value="DELIMITED">分隔檔</option>
                <option value="FIXED_WIDTH">固定寬度（未支援）</option>
                <option value="EXCEL">Excel（未支援）</option>
              </select>
            </Field>
            <Field label="編碼">
              <select value={form.encoding} onChange={e => setForm(f => ({ ...f, encoding: e.target.value }))} className={inp}>
                <option value="UTF-8">UTF-8</option><option value="BIG5">BIG5（未支援）</option>
              </select>
            </Field>
            <Field label="分隔符"><input value={form.delimiter} onChange={e => setForm(f => ({ ...f, delimiter: e.target.value }))} className={inp} /></Field>
            <Field label="略過表頭行數"><input type="number" value={form.skip_rows} onChange={e => setForm(f => ({ ...f, skip_rows: Number(e.target.value) }))} className={inp} /></Field>
            <Field label="日期格式"><input value={form.date_format} onChange={e => setForm(f => ({ ...f, date_format: e.target.value }))} placeholder="YYYY-MM-DD 或 YYY/MM/DD(民國)" className={inp} /></Field>
          </div>

          <div className="border border-[#e6e8ef] rounded-xl p-4 bg-[#fafbfd]">
            <p className="text-xs font-semibold text-[#475569] mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#2563EB]">swap_horiz</span>
              欄位對應（以欄名或欄序對應到目標欄位）
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(["balanceDate", "accountCode", "currency", "balance"] as const).map(field => (
                <div key={field} className="flex items-center gap-2 bg-white border border-[#e6e8ef] rounded-lg px-3 py-2">
                  <span className="w-20 text-xs font-medium text-[#475569] shrink-0">{CM_LABEL[field]}</span>
                  <select value={form.cm[field].by} onChange={e => setCm(field, { by: e.target.value as "name" | "index" })}
                    className="h-8 border border-[#d8dbe3] rounded-lg px-2 text-xs bg-white outline-none focus:border-[#2563EB]">
                    <option value="name">欄名</option><option value="index">欄序</option>
                  </select>
                  <input value={form.cm[field].key} onChange={e => setCm(field, { key: e.target.value })}
                    className="flex-1 h-8 border border-[#d8dbe3] rounded-lg px-2 text-sm bg-white outline-none focus:border-[#2563EB] min-w-0"
                    placeholder={form.cm[field].by === "index" ? "0,1,2…" : "欄位名稱"} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-[#eef0f4]">
            <Btn variant="primary" icon={form.id ? "save" : "add"} onClick={submit} className="px-6">
              {form.id ? "儲存修改" : "新增"}
            </Btn>
            {form.id && <Btn icon="close" onClick={() => setForm(EMPTY)}>取消編輯</Btn>}
          </div>
        </div>
      </Card>

      {/* 清單 */}
      <Card className="overflow-hidden">
        <CardHeader
          icon="tune"
          title="已設定格式"
          right={<span className="text-xs text-[#7a7d85] bg-[#f1f5f9] px-2.5 py-1 rounded-full">共 {profiles.length} 筆</span>}
        />
        {profiles.length === 0 ? (
          <EmptyState icon="tune" title="尚無格式設定" hint="於上方表單新增第一筆銀行格式設定。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f8fafc] border-b border-[#e6e8ef] text-xs font-semibold text-[#475569]">
                <tr>
                  <th className="px-4 py-3">銀行</th><th className="px-4 py-3">幣別</th><th className="px-4 py-3">名稱</th>
                  <th className="px-4 py-3">引擎</th><th className="px-4 py-3">編碼／分隔</th><th className="px-4 py-3">日期格式</th>
                  <th className="px-4 py-3">狀態</th><th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-[#eef0f4]">
                {profiles.map(p => {
                  const st = STATUS_LABEL[p.status] || { label: p.status, cls: "bg-[#eef0f4] text-[#7a7d85]" };
                  return (
                    <tr key={p.id} className={`hover:bg-[#f8f9fc] transition-colors ${form.id === p.id ? "bg-[#eff6ff]" : ""}`}>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 bg-[#f1f5f9] text-[#475569] rounded-md text-xs font-mono font-medium">{p.bank_code}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {p.currency === "ZZZ"
                          ? <span className="px-2 py-0.5 bg-[#fef3c7] text-[#b45309] rounded-full text-xs">ZZZ 共用</span>
                          : <span className="font-medium">{p.currency}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#44474e]">{p.profile_name}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 bg-[#eef2ff] text-[#4338ca] rounded-full text-xs">{p.engine}</span></td>
                      <td className="px-4 py-2.5 text-[#44474e] text-xs">{p.encoding}／{p.delimiter === "," ? "逗號" : p.delimiter}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-xs">{p.date_format}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => edit(p)} className="inline-flex items-center gap-0.5 text-[#2563EB] hover:bg-[#eff6ff] rounded-md px-2 py-1 text-xs transition-colors mr-1">
                          <span className="material-symbols-outlined text-[15px]">edit</span>編輯
                        </button>
                        <button onClick={() => del(p.id)} className="inline-flex items-center gap-0.5 text-[#b91c1c] hover:bg-[#fef2f2] rounded-md px-2 py-1 text-xs transition-colors">
                          <span className="material-symbols-outlined text-[15px]">delete</span>刪除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}

const inp = "h-10 border border-[#d8dbe3] rounded-lg px-3 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 bg-white w-full transition";
const CM_LABEL: Record<string, string> = { balanceDate: "餘額日期*", accountCode: "帳號", currency: "幣別", balance: "餘額*" };

function normRef(r: ColRef) {
  return { by: r.by, key: r.by === "index" ? Number(r.key) : r.key };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#44474e]">{label}</label>
      {children}
    </div>
  );
}
