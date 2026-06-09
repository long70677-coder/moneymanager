"use client";

import { useState, useCallback } from "react";
import { SUSPENSE_TYPE_MAP, type SuspenseTransaction, type BatchConfirmation } from "@/lib/types";

function formatNumber(val: number, currency: string = "NTD"): string {
  if (currency === "NTD") return val.toLocaleString("en-US", { minimumFractionDigits: 0 });
  return val.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export default function SuspensePage() {
  const [suspenseDate, setSuspenseDate] = useState("2023-10-27");
  const [suspenseType, setSuspenseType] = useState("ALL");
  const [currency, setCurrency] = useState("ALL");
  const [batchNo, setBatchNo] = useState("20231027001");
  const [transactions, setTransactions] = useState<SuspenseTransaction[]>([]);
  const [batchConfirmation, setBatchConfirmation] = useState<BatchConfirmation | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editedAmounts, setEditedAmounts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const handleQuery = useCallback(async () => {
    if (!batchNo) {
      showMessage("error", "批號必填");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (suspenseDate) params.set("suspenseDate", suspenseDate);
      if (suspenseType !== "ALL") params.set("suspenseType", suspenseType);
      if (currency !== "ALL") params.set("currency", currency);
      params.set("batchNo", batchNo);

      const res = await fetch(`/api/suspense-transactions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      setTransactions(data.transactions);
      setBatchConfirmation(data.batchConfirmation);
      setTotal(data.total);
      setSelectedIds(new Set());
      setEditedAmounts({});
      showMessage("success", `批號 ${batchNo} 查詢成功`);
    } catch {
      showMessage("error", "查詢失敗");
    } finally {
      setLoading(false);
    }
  }, [suspenseDate, suspenseType, currency, batchNo, showMessage]);

  const handleAdd = useCallback(async () => {
    if (!suspenseDate || suspenseType === "ALL" || currency === "ALL") {
      showMessage("error", "新增時需指定暫收日期、暫收類型、幣別");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/suspense-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suspenseDate,
          suspenseType,
          currency: currency === "NTD" ? "NTD" : currency,
          batchNo: batchNo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      if (data.batchNo) {
        setBatchNo(data.batchNo);
      }
      handleQuery();
    } catch {
      showMessage("error", "新增失敗");
    } finally {
      setLoading(false);
    }
  }, [suspenseDate, suspenseType, currency, batchNo, showMessage, handleQuery]);

  const handleSave = useCallback(async () => {
    const toSave = Object.entries(editedAmounts).map(([idStr, amountStr]) => {
      const id = parseInt(idStr);
      const tx = transactions.find(t => t.id === id);
      return {
        id,
        suspense_amount: parseFloat(amountStr.replace(/,/g, "")) || 0,
        version: tx?.version || 0,
      };
    });

    if (toSave.length === 0) {
      showMessage("error", "無修改資料可儲存");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/suspense-transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: toSave }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      setEditedAmounts({});
      handleQuery();
    } catch {
      showMessage("error", "儲存失敗");
    } finally {
      setLoading(false);
    }
  }, [editedAmounts, transactions, showMessage, handleQuery]);

  const handleDelete = useCallback(async () => {
    if (!batchNo) {
      showMessage("error", "批號必填");
      return;
    }
    if (!confirm(`確定要刪除批號 ${batchNo} 的所有暫收交易資料？`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/suspense-transactions?batchNo=${batchNo}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      setTransactions([]);
      setBatchConfirmation(null);
    } catch {
      showMessage("error", "刪除失敗");
    } finally {
      setLoading(false);
    }
  }, [batchNo, showMessage]);

  const handleConfirmToggle = useCallback(async () => {
    if (!batchNo) return;
    const isConfirmed = batchConfirmation?.confirm_status === "CONFIRMED";
    const endpoint = isConfirmed ? "/api/suspense-transactions/cancel-confirm" : "/api/suspense-transactions/confirm";

    setLoading(true);
    try {
      const firstTx = transactions[0];
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNo,
          suspenseDate: firstTx?.suspense_date || suspenseDate,
          currency: firstTx?.currency || currency,
          batchType: firstTx?.suspense_type || suspenseType,
          operator: "User",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      handleQuery();
    } catch {
      showMessage("error", isConfirmed ? "取消確認失敗" : "確認失敗");
    } finally {
      setLoading(false);
    }
  }, [batchNo, batchConfirmation, transactions, suspenseDate, currency, suspenseType, showMessage, handleQuery]);

  const isConfirmed = batchConfirmation?.confirm_status === "CONFIRMED";

  const isAnomaly = (tx: SuspenseTransaction): boolean => {
    if (tx.suspense_amount < 0) return true;
    if (tx.suspense_type === "DAILY" && tx.prev_passbook_balance === 0) return true;
    if (tx.suspense_type === "SECONDARY" && tx.today_passbook_balance === 0) return true;
    return false;
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <main className="mt-16 ml-64 p-8 flex flex-col gap-6 flex-1 bg-[#fbf8fc]">
      {/* Header & Message */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-[#1b1b1e]">暫收交易</h2>
        {message && (
          <div className={`flex items-center gap-2 p-3 border rounded text-sm ${
            message.type === "success"
              ? "bg-[#DCFCE7] border-[#bbf7d0] text-[#166534]"
              : "bg-[#FEE2E2] border-[#fecaca] text-[#991B1B]"
          }`}>
            <span className="material-symbols-outlined">{message.type === "success" ? "task_alt" : "error"}</span>
            <span dangerouslySetInnerHTML={{ __html: message.text }} />
            <button className="ml-auto hover:opacity-70" onClick={() => setMessage(null)}>
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}
      </div>

      {/* Query Panel */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[#44474e]">Suspense Date</label>
            <input
              type="date"
              value={suspenseDate}
              onChange={e => setSuspenseDate(e.target.value)}
              className="w-full border-[#E2E8F0] rounded focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] text-sm h-9 bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[#44474e]">Suspense Type</label>
            <select
              value={suspenseType}
              onChange={e => setSuspenseType(e.target.value)}
              className="w-full border-[#E2E8F0] rounded focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] text-sm h-9 bg-white"
            >
              <option value="ALL">全部 (All)</option>
              <option value="DAILY">日常暫收 (Daily)</option>
              <option value="MANUAL">手工暫收 (Manual)</option>
              <option value="SECONDARY">二次暫收 (Secondary)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[#44474e]">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full border-[#E2E8F0] rounded focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] text-sm h-9 bg-white"
            >
              <option value="ALL">全部 (All)</option>
              <option value="NTD">NTD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[#44474e]">Batch No</label>
            <input
              type="text"
              value={batchNo}
              onChange={e => setBatchNo(e.target.value)}
              placeholder="Enter Batch No..."
              className="w-full border-[#E2E8F0] rounded focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] text-sm h-9 bg-white"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleQuery}
              disabled={loading}
              className="h-9 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded font-medium text-sm flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">search</span>
              查詢 (Query)
            </button>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="h-9 px-4 bg-white border border-[#c5c6cf] hover:bg-[#f5f3f6] text-[#1b1b1e] rounded font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              新增 (Add)
            </button>
            <button
              onClick={handleSave}
              disabled={loading || Object.keys(editedAmounts).length === 0}
              className="h-9 px-4 bg-white border border-[#c5c6cf] hover:bg-[#f5f3f6] text-[#1b1b1e] rounded font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-lg">save</span>
              儲存 (Save)
            </button>
          </div>
          <button
            onClick={handleDelete}
            disabled={loading || transactions.length === 0}
            className="h-9 px-4 bg-white border border-[#991B1B] hover:bg-[#FEE2E2] text-[#991B1B] rounded font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">delete</span>
            刪除 (Delete)
          </button>
        </div>
      </section>

      {/* Result Grid */}
      {transactions.length > 0 && (
        <section className="bg-white border border-[#E2E8F0] rounded-lg shadow-sm flex flex-col overflow-hidden">
          {/* Batch Info Bar */}
          <div className="p-4 bg-[#f5f3f6] border-b border-[#E2E8F0] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#44474e]">folder</span>
                <span className="font-medium text-[#1b1b1e]">批號: {batchNo}</span>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded font-medium border ${
                isConfirmed
                  ? "bg-[#DCFCE7] text-[#166534] border-[#166534]"
                  : "bg-[#e4e2e5] text-[#44474e] border-[#c5c6cf]"
              }`}>
                {isConfirmed ? "Confirmed" : "Unconfirmed"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-[#44474e] cursor-pointer select-none">
                批號確認 (Batch Confirm)
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={isConfirmed}
                onClick={handleConfirmToggle}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 disabled:opacity-50 ${
                  isConfirmed ? "bg-[#2563EB]" : "bg-[#c5c6cf]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isConfirmed ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-sm text-[#44474e] sticky top-0 z-10 shadow-[0_1px_0_#E2E8F0]">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === transactions.length && transactions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded-sm border-[#c5c6cf] text-[#2563EB] focus:ring-[#2563EB]"
                    />
                  </th>
                  <th className="px-3 py-2.5 whitespace-nowrap">帳號短碼</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">帳號用途</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">批號</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">幣別</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">暫收類型</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">前日公司帳列餘額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">前日存摺餘額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">今日公司帳列餘額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">今日存摺餘額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">今日總立暫收金額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right text-[#031635] font-semibold">立暫收金額</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">立暫收金額(記帳幣)</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">維護人員</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">維護時間</th>
                </tr>
              </thead>
              <tbody className="text-sm font-mono divide-y divide-[#E2E8F0]">
                {transactions.map(tx => {
                  const anomaly = isAnomaly(tx);
                  const isManual = tx.suspense_type === "MANUAL";
                  const editableAmount = !isConfirmed && isManual;

                  return (
                    <tr
                      key={tx.id}
                      className={`transition-colors group ${
                        anomaly
                          ? "bg-[#FEE2E2]/40 hover:bg-[#FEE2E2]/60"
                          : "hover:bg-[#f5f3f6]"
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          className={`rounded-sm text-[#2563EB] focus:ring-[#2563EB] ${anomaly ? "border-[#991B1B]" : "border-[#c5c6cf]"}`}
                        />
                      </td>
                      <td className={`px-3 py-2 ${anomaly ? "text-[#991B1B] font-medium" : "text-[#1b1b1e]"}`}>
                        {tx.account_code}
                      </td>
                      <td className="px-3 py-2 text-[#44474e]">{tx.account_purpose}</td>
                      <td className="px-3 py-2">{tx.batch_no}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          tx.currency === "NTD"
                            ? "bg-[#dadff1] text-[#5d6272]"
                            : "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]"
                        }`}>
                          {tx.currency}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 bg-[#e4e2e5] text-[#44474e] rounded text-xs border border-[#c5c6cf]">
                          {SUSPENSE_TYPE_MAP[tx.suspense_type] || tx.suspense_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#44474e]">{formatNumber(tx.prev_company_balance, tx.currency)}</td>
                      <td className="px-3 py-2 text-right text-[#44474e]">{formatNumber(tx.prev_passbook_balance, tx.currency)}</td>
                      <td className={`px-3 py-2 text-right ${anomaly ? "text-[#991B1B] font-medium" : ""}`}>
                        {formatNumber(tx.today_company_balance, tx.currency)}
                      </td>
                      <td className={`px-3 py-2 text-right ${anomaly ? "text-[#991B1B] font-medium" : ""}`}>
                        {formatNumber(tx.today_passbook_balance, tx.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(tx.total_suspense_amount, tx.currency)}</td>
                      <td className="px-3 py-2 text-right p-1">
                        {editableAmount ? (
                          <input
                            type="text"
                            value={editedAmounts[tx.id] !== undefined ? editedAmounts[tx.id] : formatNumber(tx.suspense_amount, tx.currency)}
                            onChange={e => setEditedAmounts(prev => ({ ...prev, [tx.id]: e.target.value }))}
                            className={`w-full text-right border rounded bg-white px-2 py-1 shadow-sm font-medium focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] ${
                              anomaly ? "border-[#991B1B]" : "border-[#E2E8F0]"
                            }`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={formatNumber(tx.suspense_amount, tx.currency)}
                            readOnly
                            className="w-full text-right border border-transparent hover:border-[#E2E8F0] rounded bg-transparent px-2 py-1 transition-all cursor-default"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-[#44474e]">{formatNumber(tx.suspense_amount_local, tx.currency)}</td>
                      <td className="px-3 py-2 text-[#44474e] text-xs">{tx.updated_by}</td>
                      <td className="px-3 py-2 text-[#44474e] text-xs">
                        {tx.updated_at ? new Date(tx.updated_at).toLocaleTimeString("en-US", { hour12: false }) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-[#E2E8F0] bg-white flex justify-between items-center text-xs text-[#44474e]">
            <span>Showing 1 to {total} of {total} entries</span>
            <div className="flex gap-1">
              <button className="px-2 py-1 border border-[#c5c6cf] rounded hover:bg-[#f5f3f6] disabled:opacity-50" disabled>Prev</button>
              <button className="px-2 py-1 border border-[#2563EB] bg-[#2563EB] text-white rounded">1</button>
              <button className="px-2 py-1 border border-[#c5c6cf] rounded hover:bg-[#f5f3f6] disabled:opacity-50" disabled>Next</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
