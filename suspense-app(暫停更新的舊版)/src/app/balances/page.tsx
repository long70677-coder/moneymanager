"use client";

import { useState, useRef, useCallback } from "react";
import { useUser } from "@/components/UserProvider";
import { PageShell, PageHeader, Card, CardHeader, Btn, Toast, Stat, EmptyState, Modal } from "@/components/ui";

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

interface PreviewData {
  fileName: string;
  accountCode: string;
  records: Array<{ sourceRow: number; balanceDate: string; accountCode: string; currency: string; balance: number }>;
  errors: Array<{ sourceRow: number; message: string }>;
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
  const [queried, setQueried] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
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
      setQueried(true);
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
      setFileNames([]);
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
      setPreviewData({
        fileName: files[0].name,
        accountCode: data.accountCode,
        records: data.records || [],
        errors: data.errors || [],
      });
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

  // 統計
  const importedCount = rows.filter(r => r.passbookBalance != null).length;
  const diffCount = rows.filter(r => r.diff != null && r.diff !== 0).length;
  const unreviewedCount = rows.filter(r => r.passbookBalance != null && !r.isReviewed).length;

  return (
    <PageShell>
      <PageHeader
        group="日常作業"
        title="存摺餘額轉檔"
        description="匯入銀行存摺餘額（一檔一帳號，依檔名對應帳號），與系統帳列餘額並陳比對，人工調整與全批覆核後供立暫收。"
      />

      {message && <Toast type={message.type} text={message.text} onClose={() => setMessage(null)} />}

      {/* 條件 + 轉檔區 */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">餘額日期</label>
            <input type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)}
              className="border border-[#d8dbe3] rounded-lg text-sm h-10 px-3 bg-white outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">幣別</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="border border-[#d8dbe3] rounded-lg text-sm h-10 px-3 bg-white outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition">
              <option value="NTD">新台幣 (NTD)</option><option value="USD">美元 (USD)</option>
              <option value="EUR">歐元 (EUR)</option><option value="JPY">日圓 (JPY)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-medium text-[#44474e]">餘額檔案（可多選，一檔一帳號）</label>
            <label className="h-10 flex items-center gap-2 px-3 border border-dashed border-[#b9c0cf] rounded-lg cursor-pointer hover:border-[#2563EB] hover:bg-[#f8faff] transition text-sm">
              <span className="material-symbols-outlined text-[18px] text-[#2563EB]">upload_file</span>
              {fileNames.length === 0
                ? <span className="text-[#94a3b8]">點選選擇檔案…</span>
                : <span className="text-[#1e293b] truncate">已選 {fileNames.length} 檔：{fileNames.join("、")}</span>}
              <input ref={fileRef} type="file" multiple className="hidden"
                onChange={e => setFileNames(Array.from(e.target.files ?? []).map(f => f.name))} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-[#eef0f4]">
          <Btn variant="primary" icon="search" onClick={query} disabled={loading} className="px-6">查詢</Btn>
          <Btn icon="upload_file" onClick={upload} disabled={loading}>轉檔</Btn>
          <Btn icon="preview" onClick={preview} disabled={loading}>試轉預覽</Btn>
          <label className="flex items-center gap-1.5 text-sm text-[#44474e] ml-1 cursor-pointer select-none">
            <input type="checkbox" checked={secondImport} onChange={e => setSecondImport(e.target.checked)}
              className="w-4 h-4 accent-[#2563EB]" />
            二次轉入（保留前筆）
          </label>
        </div>
      </Card>

      {/* 統計卡 */}
      {queried && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon="account_balance_wallet" label="可維護帳號" value={rows.length} />
          <Stat icon="download_done" label="已轉入" value={importedCount} tone="blue" />
          <Stat icon="difference" label="差額不為 0" value={diffCount} tone={diffCount > 0 ? "red" : "default"} />
          <Stat icon="pending_actions" label="未覆核" value={unreviewedCount} tone={unreviewedCount > 0 ? "amber" : "green"} />
        </div>
      )}

      {/* 餘額明細 */}
      <Card className="overflow-hidden">
        <CardHeader
          icon="savings"
          title={<>存摺餘額明細<span className="ml-2 font-normal text-[#7a7d85]">{balanceDate}・{currency}</span></>}
          right={
            <>
              <Btn size="sm" icon="verified" onClick={review} disabled={loading || rows.length === 0}>全批覆核</Btn>
              <Btn size="sm" icon="save" onClick={save} disabled={loading || rows.length === 0}>儲存</Btn>
            </>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            icon="manage_search"
            title={queried ? "查無可維護帳號" : "請設定條件後按「查詢」"}
            hint={queried ? "此日期／幣別下沒有您可維護的暫收帳戶。" : "查詢後將並列顯示系統帳列餘額與銀行存摺轉入餘額，並計算差額。"}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f8fafc] border-b border-[#e6e8ef] text-xs font-semibold text-[#475569]">
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
                    <tr key={r.accountCode} className="hover:bg-[#f8f9fc] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[#0f172a]">{r.accountCode}</td>
                      <td className="px-4 py-2.5 text-[#44474e]">{r.accountPurpose}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#44474e]">{fmt(r.ledgerBalance)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="checkbox" checked={isChecked} className="w-4 h-4 accent-[#2563EB]"
                          onChange={e => setChecked(p => ({ ...p, [r.accountCode]: e.target.checked }))} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isChecked ? (
                          <input value={editVal} onChange={e => setEdits(p => ({ ...p, [r.accountCode]: e.target.value }))}
                            className="w-32 text-right font-mono tabular-nums border border-[#2563EB] rounded-lg px-2 py-1 outline-none ring-2 ring-[#2563EB]/15" />
                        ) : (
                          <span className="font-mono tabular-nums">{fmt(r.passbookBalance)}</span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${r.diff != null && r.diff !== 0 ? "text-[#b91c1c] font-semibold" : "text-[#44474e]"}`}>{fmt(r.diff)}</td>
                      <td className="px-4 py-2.5">
                        {r.dataType
                          ? <span className="px-2 py-0.5 bg-[#eef2ff] text-[#4338ca] rounded-full text-xs border border-[#e0e7ff]">{DATA_TYPE_LABEL[r.dataType] || r.dataType}{r.importSeq && r.importSeq > 1 ? `(次${r.importSeq})` : ""}</span>
                          : <span className="text-[#9aa0ad] text-xs">未轉入</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {r.passbookBalance == null ? <span className="text-[#9aa0ad]">—</span>
                          : r.isReviewed ? <span className="text-[#15803d] text-xs inline-flex items-center gap-0.5"><span className="material-symbols-outlined text-[16px]">check_circle</span>已覆核</span>
                            : <span className="text-[#b45309] text-xs inline-flex items-center gap-0.5"><span className="material-symbols-outlined text-[16px]">schedule</span>未覆核</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 試轉預覽彈窗 */}
      {previewData && (
        <Modal
          icon="preview"
          title={<>試轉預覽<span className="ml-2 font-normal text-[#7a7d85]">{previewData.fileName}・帳號 {previewData.accountCode}</span></>}
          onClose={() => setPreviewData(null)}
          footer={
            <>
              <span className="mr-auto text-xs text-[#7a7d85] self-center">僅解析檢核，未寫入資料庫</span>
              <Btn size="sm" onClick={() => setPreviewData(null)}>關閉</Btn>
            </>
          }
        >
          <div className="p-5 flex flex-col gap-4">
            <div className="flex gap-3">
              <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-medium">解析成功 {previewData.records.length} 列</span>
              {previewData.errors.length > 0 && (
                <span className="px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] rounded-full text-xs font-medium">錯誤 {previewData.errors.length} 列</span>
              )}
            </div>
            {previewData.records.length > 0 && (
              <div className="border border-[#e6e8ef] rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#f8fafc] border-b border-[#e6e8ef] text-xs font-semibold text-[#475569]">
                    <tr>
                      <th className="px-4 py-2.5">列</th>
                      <th className="px-4 py-2.5">餘額日期</th>
                      <th className="px-4 py-2.5">帳號</th>
                      <th className="px-4 py-2.5">幣別</th>
                      <th className="px-4 py-2.5 text-right">餘額</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-[#eef0f4]">
                    {previewData.records.slice(0, 50).map(r => (
                      <tr key={r.sourceRow}>
                        <td className="px-4 py-2 text-[#7a7d85] text-xs">{r.sourceRow}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">{r.balanceDate}</td>
                        <td className="px-4 py-2 font-medium">{r.accountCode || previewData.accountCode}</td>
                        <td className="px-4 py-2">{r.currency}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{r.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {previewData.errors.length > 0 && (
              <div className="border border-[#fecaca] bg-[#fef2f2] rounded-xl p-4 flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-[#991B1B] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">error</span>錯誤列
                </p>
                {previewData.errors.map((e, i) => (
                  <p key={i} className="text-sm text-[#991B1B]">第 {e.sourceRow} 列：{e.message}</p>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
