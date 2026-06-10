"use client";

import { useState, useRef, useCallback } from "react";
import { useUser } from "@/components/UserProvider";

interface BalanceRow {
  accountCode: string;
  accountName: string;
  accountPurpose: string;
  currency: string;
  ledgerBalance: number | null;
  passbookBalance: number | null;
  dataType: string | null;
  importSeq: number | null;
  isReviewed: number;
  diff: number | null;
}

const DATA_TYPE_LABEL: Record<string, string> = {
  FILE_IMPORT: "檔案轉入", MANUAL: "人工輸入", PREV_DAY: "前日餘額",
};

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

export default function BalancesPage() {
  const { currentUser } = useUser();
  const [balanceDate, setBalanceDate] = useState("2023-10-26");
  const [currency, setCurrency] = useState("NTD");
  const [secondImport, setSecondImport] = useState(false);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const show = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  }, []);

  const query = useCallback(async () => {
    if (!balanceDate || !currency) { show("error", "餘額日期與幣別必填"); return; }
    setLoading(true);
    try {
      const p = new URLSearchParams({ balanceDate, currency });
      if (currentUser) p.set("userId", String(currentUser.id));
      const res = await fetch(`/api/balances?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查詢失敗");
      setRows(data.rows || []);
      setChecked({}); setEdits({});
      if ((data.rows || []).length === 0) show("error", "查無可維護帳號");
    } catch (e) { show("error", e instanceof Error ? e.message : "查詢失敗"); }
    finally { setLoading(false); }
  }, [balanceDate, currency, currentUser, show]);

  const upload = useCallback(async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) { show("error", "請先選擇檔案"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("files", f));
      fd.set("balanceDate", balanceDate);
      fd.set("currency", currency);
      if (currentUser) { fd.set("userId", String(currentUser.id)); fd.set("operator", currentUser.user_name); }
      fd.set("secondImport", String(secondImport));
      const res = await fetch("/api/balance-import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { show("error", data.error || "轉檔失敗"); return; }
      const fails = (data.results || []).filter((r: { status: string }) => r.status !== "SUCCESS");
      if (fails.length === 0) show("success", `轉檔完成：${data.fileCount} 檔、成功 ${data.totalSuccess} 筆`);
      else show("error", `轉檔完成但有失敗：成功 ${data.totalSuccess}、失敗 ${data.totalFail}。` + fails.map((f: { fileName: string; errors: { message: string }[] }) => `${f.fileName}：${f.errors[0]?.message}`).join("；"));
      if (fileRef.current) fileRef.current.value = "";
      await query();
    } catch { show("error", "轉檔失敗"); }
    finally { setLoading(false); }
  }, [balanceDate, currency, currentUser, secondImport, show, query]);

  const preview = useCallback(async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) { show("error", "請先選擇檔案（試轉預覽第一個檔）"); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("file", files[0]);
      const res = await fetch("/api/balance-import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) { show("error", `試轉：${data.error}`); return; }
      const lines = (data.records || []).slice(0, 10).map((r: { sourceRow: number; balanceDate: string; accountCode: string; currency: string; balance: number }) => `第${r.sourceRow}列 ${r.balanceDate} ${r.accountCode || data.accountCode} ${r.currency} ${r.balance.toLocaleString()}`);
      const errs = (data.errors || []).map((e: { sourceRow: number; message: string }) => `第${e.sourceRow}列 ✕ ${e.message}`);
      show("success", `試轉 ${files[0].name}（帳號 ${data.accountCode}）：解析 ${data.records.length} 列、錯誤 ${data.errors.length} 列。` + [...lines, ...errs].join("｜"));
    } catch { show("error", "試轉失敗"); }
    finally { setLoading(false); }
  }, [show]);

  const save = useCallback(async () => {
    const editList = Object.keys(checked).filter(k => checked[k] && edits[k] !== undefined)
      .map(accountCode => ({ accountCode, balance: parseFloat((edits[accountCode] || "0").replace(/,/g, "")) || 0 }));
    if (editList.length === 0) { show("error", "無勾選或未修改的存摺餘額"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/balances", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceDate, currency, userId: currentUser?.id, operator: currentUser?.user_name, edits: editList }),
      });
      const data = await res.json();
      if (!res.ok) { show("error", data.error); return; }
      show("success", data.message);
      await query();
    } catch { show("error", "儲存失敗"); }
    finally { setLoading(false); }
  }, [checked, edits, balanceDate, currency, currentUser, show, query]);

  const review = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/balances/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceDate, currency, userId: currentUser?.id, operator: currentUser?.user_name }),
      });
      const data = await res.json();
      if (!res.ok) { show("error", data.error); return; }
      show("success", data.message);
      await query();
    } catch { show("error", "覆核失敗"); }
    finally { setLoading(false); }
  }, [balanceDate, currency, currentUser, show, query]);

  return (
    <main className="mt-16 ml-64 p-8 flex flex-col gap-6 flex-1 bg-[#f7f8fb] min-h-[calc(100vh-4rem)]">
      <div>
        <p className="text-xs text-[#7a7d85] mb-1 flex items-center gap-1">
          <span>資金管理</span><span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-[#2563EB] font-medium">存摺餘額轉檔</span>
        </p>
        <h2 className="text-2xl font-bold text-[#1b1b1e]">存摺餘額轉檔</h2>
        <p className="text-sm text-[#7a7d85] mt-1">匯入銀行存摺餘額（一檔一帳號，依檔名對應帳號），人工調整與全批覆核後供立暫收。</p>
      </div>

      {message && (
        <div className={`flex items-start gap-2 p-3 border rounded-lg text-sm shadow-sm ${message.type === "success" ? "bg-[#DCFCE7] border-[#bbf7d0] text-[#166534]" : "bg-[#FEE2E2] border-[#fecaca] text-[#991B1B]"}`}>
          <span className="material-symbols-outlined text-[20px]">{message.type === "success" ? "task_alt" : "error"}</span>
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
      )}

      {/* 條件 + 轉檔區 */}
      <section className="bg-white border border-[#e6e8ef] rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">餘額日期</label>
            <input type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)} className="border border-[#d8dbe3] rounded-lg text-sm h-10 px-3 outline-none focus:border-[#2563EB]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">幣別</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="border border-[#d8dbe3] rounded-lg text-sm h-10 px-3 outline-none focus:border-[#2563EB] bg-white">
              <option value="NTD">新台幣 (NTD)</option><option value="USD">美元 (USD)</option>
              <option value="EUR">歐元 (EUR)</option><option value="JPY">日圓 (JPY)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-medium text-[#44474e]">選擇檔案（可多選，一檔一帳號）</label>
            <input ref={fileRef} type="file" multiple className="text-sm h-10 file:mr-3 file:h-8 file:px-3 file:rounded-md file:border-0 file:bg-[#2563EB] file:text-white" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#eef0f4]">
          <button onClick={query} disabled={loading} className="h-10 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">search</span>查詢
          </button>
          <button onClick={upload} disabled={loading} className="h-10 px-4 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">upload_file</span>轉檔
          </button>
          <button onClick={preview} disabled={loading} className="h-10 px-4 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">preview</span>試轉預覽
          </button>
          <label className="flex items-center gap-1.5 text-sm text-[#44474e] ml-1 cursor-pointer select-none">
            <input type="checkbox" checked={secondImport} onChange={e => setSecondImport(e.target.checked)} />二次轉入（保留前筆）
          </label>
        </div>
      </section>

      {/* 餘額明細 */}
      <section className="bg-white border border-[#e6e8ef] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-2 border-b border-[#e6e8ef]">
          <span className="material-symbols-outlined text-[#2563EB] text-[20px]">savings</span>
          <h3 className="text-sm font-semibold">存摺餘額明細（{balanceDate}・{currency}）</h3>
          <div className="ml-auto flex gap-2">
            <button onClick={review} disabled={loading || rows.length === 0} className="h-9 px-3 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">verified</span>全批覆核
            </button>
            <button onClick={save} disabled={loading || rows.length === 0} className="h-9 px-3 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">save</span>儲存
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-[#f1f4f9] border-b border-[#e6e8ef] text-xs font-semibold text-[#44474e]">
              <tr>
                <th className="px-4 py-3">帳號</th>
                <th className="px-4 py-3">用途</th>
                <th className="px-4 py-3 text-right">系統帳列餘額<br /><span className="font-normal text-[#9aa0ad]">(唯讀)</span></th>
                <th className="px-4 py-3 text-center w-10">編輯</th>
                <th className="px-4 py-3 text-right">銀行存摺轉入餘額<br /><span className="font-normal text-[#9aa0ad]">(勾選可改)</span></th>
                <th className="px-4 py-3 text-right">差額</th>
                <th className="px-4 py-3">資料來源</th>
                <th className="px-4 py-3 text-center">覆核</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-[#eef0f4]">
              {rows.map(r => {
                const isChecked = !!checked[r.accountCode];
                const editVal = edits[r.accountCode] !== undefined ? edits[r.accountCode] : (r.passbookBalance != null ? String(r.passbookBalance) : "");
                return (
                  <tr key={r.accountCode} className="hover:bg-[#f8f9fc]">
                    <td className="px-4 py-2.5 font-medium">{r.accountCode}</td>
                    <td className="px-4 py-2.5 text-[#44474e]">{r.accountPurpose}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#44474e]">{fmt(r.ledgerBalance)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <input type="checkbox" checked={isChecked} onChange={e => setChecked(p => ({ ...p, [r.accountCode]: e.target.checked }))} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isChecked ? (
                        <input value={editVal} onChange={e => setEdits(p => ({ ...p, [r.accountCode]: e.target.value }))}
                          className="w-32 text-right font-mono border border-[#2563EB] rounded px-2 py-1 outline-none" />
                      ) : (
                        <span className="font-mono">{fmt(r.passbookBalance)}</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono ${r.diff != null && r.diff !== 0 ? "text-[#991B1B] font-medium" : "text-[#44474e]"}`}>{fmt(r.diff)}</td>
                    <td className="px-4 py-2.5">
                      {r.dataType ? <span className="px-2 py-0.5 bg-[#eef0f4] rounded-full text-xs">{DATA_TYPE_LABEL[r.dataType] || r.dataType}{r.importSeq && r.importSeq > 1 ? `(次${r.importSeq})` : ""}</span> : <span className="text-[#9aa0ad] text-xs">未轉入</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.passbookBalance == null ? <span className="text-[#9aa0ad]">—</span>
                        : r.isReviewed ? <span className="text-[#166534] text-xs flex items-center justify-center gap-0.5"><span className="material-symbols-outlined text-[16px]">check_circle</span>已覆核</span>
                          : <span className="text-[#b45309] text-xs">未覆核</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#9aa0ad]">請設定條件後按「查詢」</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
