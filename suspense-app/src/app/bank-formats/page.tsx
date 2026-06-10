"use client";

import { useEffect, useState, useCallback } from "react";

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
    <main className="mt-16 ml-64 p-8 flex flex-col gap-6 flex-1 bg-[#f7f8fb] min-h-[calc(100vh-4rem)]">
      <div>
        <p className="text-xs text-[#7a7d85] mb-1 flex items-center gap-1">
          <span>系統設定</span><span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-[#2563EB] font-medium">銀行格式設定</span>
        </p>
        <h2 className="text-2xl font-bold text-[#1b1b1e]">銀行格式設定</h2>
        <p className="text-sm text-[#7a7d85] mt-1">設定各銀行餘額檔的解析方式（鍵＝銀行＋幣別，幣別可用 ZZZ 表共用）。新增銀行或調整格式於此維護，不需改程式。</p>
      </div>

      {msg && (
        <div className={`p-3 border rounded-lg text-sm shadow-sm ${msg.t === "ok" ? "bg-[#DCFCE7] border-[#bbf7d0] text-[#166534]" : "bg-[#FEE2E2] border-[#fecaca] text-[#991B1B]"}`}>{msg.m}</div>
      )}

      {/* 編輯表單 */}
      <section className="bg-white border border-[#e6e8ef] rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[#2563EB] text-[20px]">{form.id ? "edit" : "add_circle"}</span>
          {form.id ? `編輯設定 #${form.id}` : "新增格式設定"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="銀行代碼"><input value={form.bank_code} onChange={e => setForm(f => ({ ...f, bank_code: e.target.value }))} className={inp} /></Field>
          <Field label="幣別 (或 ZZZ)"><input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={inp} /></Field>
          <Field label="設定名稱"><input value={form.profile_name} onChange={e => setForm(f => ({ ...f, profile_name: e.target.value }))} className={inp} /></Field>
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

        <div className="border-t border-[#eef0f4] pt-3">
          <p className="text-xs font-semibold text-[#44474e] mb-2">欄位對應（以欄名或欄序對應到目標欄位）</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["balanceDate", "accountCode", "currency", "balance"] as const).map(field => (
              <div key={field} className="flex items-center gap-2">
                <span className="w-20 text-xs text-[#44474e]">{CM_LABEL[field]}</span>
                <select value={form.cm[field].by} onChange={e => setCm(field, { by: e.target.value as "name" | "index" })} className="h-9 border border-[#d8dbe3] rounded-lg px-2 text-sm">
                  <option value="name">欄名</option><option value="index">欄序</option>
                </select>
                <input value={form.cm[field].key} onChange={e => setCm(field, { key: e.target.value })} className="flex-1 h-9 border border-[#d8dbe3] rounded-lg px-2 text-sm" placeholder={form.cm[field].by === "index" ? "0,1,2…" : "欄位名稱"} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={submit} className="h-10 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg font-medium text-sm">{form.id ? "儲存修改" : "新增"}</button>
          {form.id && <button onClick={() => setForm(EMPTY)} className="h-10 px-4 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] rounded-lg text-sm">取消編輯</button>}
        </div>
      </section>

      {/* 清單 */}
      <section className="bg-white border border-[#e6e8ef] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e6e8ef] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#2563EB] text-[20px]">tune</span>
          <h3 className="text-sm font-semibold">已設定格式（{profiles.length}）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-[#f1f4f9] border-b border-[#e6e8ef] text-xs font-semibold text-[#44474e]">
              <tr>
                <th className="px-4 py-3">銀行</th><th className="px-4 py-3">幣別</th><th className="px-4 py-3">名稱</th>
                <th className="px-4 py-3">引擎</th><th className="px-4 py-3">編碼/分隔</th><th className="px-4 py-3">日期格式</th>
                <th className="px-4 py-3">狀態</th><th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[#eef0f4]">
              {profiles.map(p => (
                <tr key={p.id} className="hover:bg-[#f8f9fc]">
                  <td className="px-4 py-2.5 font-medium">{p.bank_code}</td>
                  <td className="px-4 py-2.5">{p.currency === "ZZZ" ? <span className="px-2 py-0.5 bg-[#fef3c7] text-[#b45309] rounded-full text-xs">ZZZ 共用</span> : p.currency}</td>
                  <td className="px-4 py-2.5 text-[#44474e]">{p.profile_name}</td>
                  <td className="px-4 py-2.5">{p.engine}</td>
                  <td className="px-4 py-2.5 text-[#44474e]">{p.encoding}／{p.delimiter === "," ? "逗號" : p.delimiter}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.date_format}</td>
                  <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs ${p.status === "ACTIVE" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#eef0f4] text-[#7a7d85]"}`}>{p.status}</span></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => edit(p)} className="text-[#2563EB] hover:underline text-xs mr-3">編輯</button>
                    <button onClick={() => del(p.id)} className="text-[#991B1B] hover:underline text-xs">刪除</button>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9aa0ad]">尚無格式設定</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const inp = "h-9 border border-[#d8dbe3] rounded-lg px-2 text-sm outline-none focus:border-[#2563EB] bg-white w-full";
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
