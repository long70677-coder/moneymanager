"use client";

import { useState, useCallback, useEffect } from "react";
import { SUSPENSE_TYPE_MAP, type SuspenseTransaction, type BatchConfirmation } from "@/lib/types";
import { useUser } from "@/components/UserProvider";

function formatNumber(val: number, currency: string = "NTD"): string {
  if (currency === "NTD") return val.toLocaleString("en-US", { minimumFractionDigits: 0 });
  return val.toLocaleString("en-US", { minimumFractionDigits: 2 });
}

const CURRENCY_NAME: Record<string, string> = {
  NTD: "新台幣",
  USD: "美元",
  EUR: "歐元",
  JPY: "日圓",
};

interface BatchCard {
  batchNo: string;
  suspenseDate: string;
  suspenseType: string;
  currency: string;
  transactions: SuspenseTransaction[];
  batchConfirmation: BatchConfirmation | null;
  expanded: boolean;
}

function isAnomaly(tx: SuspenseTransaction): boolean {
  if (tx.suspense_amount < 0) return true;
  if (tx.suspense_type === "DAILY" && tx.prev_passbook_balance === 0) return true;
  if (tx.suspense_type === "SECONDARY" && tx.today_passbook_balance === 0) return true;
  return false;
}

export default function SuspensePage() {
  const { currentUser } = useUser();

  // 查詢條件（純輸入，不與結果連動）
  const [suspenseDate, setSuspenseDate] = useState("2023-10-27");
  const [suspenseType, setSuspenseType] = useState("ALL");
  const [currency, setCurrency] = useState("NTD");
  const [batchNo, setBatchNo] = useState("20231027001");

  // 已載入的批號卡片清單
  const [batches, setBatches] = useState<BatchCard[]>([]);
  const [editedAmounts, setEditedAmounts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  // 向後端取得單一批號資料
  const fetchBatch = useCallback(async (qDate: string, qType: string, qCurrency: string, qBatchNo: string) => {
    const params = new URLSearchParams();
    if (qDate) params.set("suspenseDate", qDate);
    if (qType !== "ALL") params.set("suspenseType", qType);
    params.set("currency", qCurrency);
    params.set("batchNo", qBatchNo);
    if (currentUser) params.set("userId", String(currentUser.id));
    const res = await fetch(`/api/suspense-transactions?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "查詢失敗");
    return data as { transactions: SuspenseTransaction[]; batchConfirmation: BatchConfirmation | null; total: number };
  }, [currentUser]);

  // 切換操作者時清空已載入卡片，避免顯示前一位使用者的資料
  useEffect(() => {
    setBatches([]);
    setEditedAmounts({});
  }, [currentUser?.id]);

  // 新增或更新一張卡片（以批號為 key；已存在則就地更新，保留展開狀態）
  const upsertCard = useCallback((card: Omit<BatchCard, "expanded"> & { expanded?: boolean }) => {
    setBatches(prev => {
      const idx = prev.findIndex(b => b.batchNo === card.batchNo);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...card, expanded: card.expanded ?? prev[idx].expanded };
        return next;
      }
      return [...prev, { ...card, expanded: card.expanded ?? true }];
    });
  }, []);

  const handleQuery = useCallback(async () => {
    if (currency === "ALL") {
      showMessage("error", "請選擇單一幣別（同一批號僅限單一幣別）");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (suspenseDate) params.set("suspenseDate", suspenseDate);
      if (suspenseType !== "ALL") params.set("suspenseType", suspenseType);
      params.set("currency", currency);
      if (batchNo) params.set("batchNo", batchNo);
      if (currentUser) params.set("userId", String(currentUser.id));
      const res = await fetch(`/api/suspense-transactions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "查詢失敗");

      const resultBatches = (data.batches ?? []) as Array<{
        batchNo: string;
        suspenseDate: string;
        suspenseType: string;
        currency: string;
        transactions: SuspenseTransaction[];
        batchConfirmation: BatchConfirmation | null;
      }>;

      if (resultBatches.length === 0) {
        showMessage("error", batchNo ? `批號 ${batchNo} 查無資料` : "查無符合條件的暫收資料");
        return;
      }

      resultBatches.forEach(b => upsertCard({ ...b, expanded: true }));
      setEditedAmounts({});
      showMessage(
        "success",
        batchNo ? `批號 ${batchNo} 查詢成功` : `查詢成功，共載入 ${resultBatches.length} 個批號`,
      );
    } catch (e) {
      showMessage("error", e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  }, [suspenseDate, suspenseType, currency, batchNo, currentUser, upsertCard, showMessage]);

  const handleAdd = useCallback(async () => {
    if (!suspenseDate || suspenseType === "ALL" || currency === "ALL") {
      showMessage("error", "新增時需指定暫收日期、暫收類型、單一幣別");
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
          currency,
          batchNo: batchNo || undefined,
          userId: currentUser?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      // 載入新批號為一張新卡片（往下新增），查詢欄位維持不變
      const newBatchNo: string = data.batchNo;
      const bData = await fetchBatch(suspenseDate, suspenseType, currency, newBatchNo);
      upsertCard({
        batchNo: newBatchNo,
        suspenseDate,
        suspenseType,
        currency,
        transactions: bData.transactions,
        batchConfirmation: bData.batchConfirmation,
        expanded: true,
      });
      showMessage("success", data.message);
    } catch {
      showMessage("error", "新增失敗");
    } finally {
      setLoading(false);
    }
  }, [suspenseDate, suspenseType, currency, batchNo, currentUser, fetchBatch, upsertCard, showMessage]);

  // 重新載入指定卡片
  const refreshCard = useCallback(async (card: BatchCard) => {
    try {
      const data = await fetchBatch(card.suspenseDate, card.suspenseType, card.currency, card.batchNo);
      upsertCard({
        batchNo: card.batchNo,
        suspenseDate: card.suspenseDate,
        suspenseType: card.suspenseType,
        currency: card.currency,
        transactions: data.transactions,
        batchConfirmation: data.batchConfirmation,
      });
    } catch {
      /* ignore */
    }
  }, [fetchBatch, upsertCard]);

  const handleSave = useCallback(async () => {
    const allTx = batches.flatMap(b => b.transactions);
    const toSave = Object.entries(editedAmounts).map(([idStr, amountStr]) => {
      const id = parseInt(idStr);
      const tx = allTx.find(t => t.id === id);
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
      await Promise.all(batches.map(refreshCard));
    } catch {
      showMessage("error", "儲存失敗");
    } finally {
      setLoading(false);
    }
  }, [batches, editedAmounts, refreshCard, showMessage]);

  const handleDeleteCard = useCallback(async (card: BatchCard) => {
    if (!confirm(`確定要刪除批號 ${card.batchNo} 的所有暫收交易資料？`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suspense-transactions?batchNo=${card.batchNo}&userId=${currentUser?.id ?? ""}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      setBatches(prev => prev.filter(b => b.batchNo !== card.batchNo));
    } catch {
      showMessage("error", "刪除失敗");
    } finally {
      setLoading(false);
    }
  }, [currentUser, showMessage]);

  const handleConfirmToggle = useCallback(async (card: BatchCard) => {
    const isConfirmed = card.batchConfirmation?.confirm_status === "CONFIRMED";
    const endpoint = isConfirmed ? "/api/suspense-transactions/cancel-confirm" : "/api/suspense-transactions/confirm";
    const firstTx = card.transactions[0];

    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchNo: card.batchNo,
          suspenseDate: firstTx?.suspense_date || card.suspenseDate,
          currency: firstTx?.currency || card.currency,
          batchType: firstTx?.suspense_type || card.suspenseType,
          operator: currentUser?.user_name || "User",
          userId: currentUser?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error);
        return;
      }
      showMessage("success", data.message);
      await refreshCard(card);
    } catch {
      showMessage("error", isConfirmed ? "取消確認失敗" : "確認失敗");
    } finally {
      setLoading(false);
    }
  }, [currentUser, refreshCard, showMessage]);

  const toggleExpand = useCallback((batchNo: string) => {
    setBatches(prev => prev.map(b => b.batchNo === batchNo ? { ...b, expanded: !b.expanded } : b));
  }, []);

  return (
    <main className="mt-16 ml-64 p-8 flex flex-col gap-6 flex-1 bg-[#f7f8fb] min-h-[calc(100vh-4rem)]">
      {/* 標題與訊息 */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-[#7a7d85] mb-1 flex items-center gap-1">
            <span>資金管理</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-[#2563EB] font-medium">暫收交易</span>
          </p>
          <h2 className="text-2xl font-bold text-[#1b1b1e]">暫收交易作業</h2>
          <p className="text-sm text-[#7a7d85] mt-1">依銀行存摺餘額與公司帳列餘額之差額辦理立暫收，並進行批號確認與傳票產生。</p>
          {currentUser && (
            <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              currentUser.role === "MANAGER"
                ? "bg-[#ede9fe] text-[#6d28d9]"
                : "bg-[#dbeafe] text-[#1d4ed8]"
            }`}>
              <span className="material-symbols-outlined text-[14px]">
                {currentUser.role === "MANAGER" ? "visibility" : "person"}
              </span>
              {currentUser.role === "MANAGER"
                ? `${currentUser.user_name}（主管）：可檢視與操作所有帳號及批號`
                : `${currentUser.user_name}（經辦）：僅顯示與操作您負責的帳號`}
            </div>
          )}
        </div>
        {message && (
          <div className={`flex items-center gap-2 p-3 border rounded-lg text-sm shadow-sm ${
            message.type === "success"
              ? "bg-[#DCFCE7] border-[#bbf7d0] text-[#166534]"
              : "bg-[#FEE2E2] border-[#fecaca] text-[#991B1B]"
          }`}>
            <span className="material-symbols-outlined text-[20px]">{message.type === "success" ? "task_alt" : "error"}</span>
            <span dangerouslySetInnerHTML={{ __html: message.text }} />
            <button className="ml-auto hover:opacity-70" onClick={() => setMessage(null)}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
      </div>

      {/* 查詢條件區 */}
      <section className="bg-white border border-[#e6e8ef] rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[#2563EB] text-[20px]">filter_alt</span>
          <h3 className="text-sm font-semibold text-[#1b1b1e]">查詢條件</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">暫收日期</label>
            <input
              type="date"
              value={suspenseDate}
              onChange={e => setSuspenseDate(e.target.value)}
              className="w-full border border-[#d8dbe3] rounded-lg focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 text-sm h-10 px-3 bg-white outline-none transition"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">暫收類型</label>
            <select
              value={suspenseType}
              onChange={e => setSuspenseType(e.target.value)}
              className="w-full border border-[#d8dbe3] rounded-lg focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 text-sm h-10 px-3 bg-white outline-none transition"
            >
              <option value="ALL">全部類型</option>
              <option value="DAILY">日常暫收</option>
              <option value="MANUAL">手工暫收</option>
              <option value="SECONDARY">二次暫收</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">幣別</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full border border-[#d8dbe3] rounded-lg focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 text-sm h-10 px-3 bg-white outline-none transition"
            >
              <option value="NTD">新台幣 (NTD)</option>
              <option value="USD">美元 (USD)</option>
              <option value="EUR">歐元 (EUR)</option>
              <option value="JPY">日圓 (JPY)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#44474e]">批號</label>
            <input
              type="text"
              value={batchNo}
              onChange={e => setBatchNo(e.target.value)}
              placeholder="留空＝查詢符合條件全部批號／新增時自動取號"
              className="w-full border border-[#d8dbe3] rounded-lg focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 text-sm h-10 px-3 bg-white outline-none transition"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-[#eef0f4]">
          <button
            onClick={handleQuery}
            disabled={loading}
            className="h-10 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
            查詢
          </button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="h-10 px-4 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] text-[#1b1b1e] rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增批號
          </button>
          <button
            onClick={handleSave}
            disabled={loading || Object.keys(editedAmounts).length === 0}
            className="h-10 px-4 bg-white border border-[#d8dbe3] hover:bg-[#f5f6fa] text-[#1b1b1e] rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            儲存修改
            {Object.keys(editedAmounts).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-[#2563EB] text-white rounded-full text-[11px]">{Object.keys(editedAmounts).length}</span>
            )}
          </button>
        </div>
      </section>

      {/* 批號卡片清單 */}
      {batches.length > 0 ? (
        <div className="flex flex-col gap-4">
          {batches.map(card => (
            <BatchCardView
              key={card.batchNo}
              card={card}
              loading={loading}
              editedAmounts={editedAmounts}
              setEditedAmounts={setEditedAmounts}
              onToggleExpand={() => toggleExpand(card.batchNo)}
              onConfirmToggle={() => handleConfirmToggle(card)}
              onDelete={() => handleDeleteCard(card)}
            />
          ))}
        </div>
      ) : (
        <section className="bg-white border border-dashed border-[#d8dbe3] rounded-xl shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f1f4f9] flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px] text-[#9aa0ad]">receipt_long</span>
          </div>
          <p className="text-[#44474e] font-medium">尚無批號資料</p>
          <p className="text-sm text-[#9aa0ad] mt-1">請於上方輸入批號並點選「查詢」，或點選「新增批號」建立暫收交易；每個批號會以獨立卡片往下顯示。</p>
        </section>
      )}
    </main>
  );
}

function BatchCardView({
  card,
  loading,
  editedAmounts,
  setEditedAmounts,
  onToggleExpand,
  onConfirmToggle,
  onDelete,
}: {
  card: BatchCard;
  loading: boolean;
  editedAmounts: Record<number, string>;
  setEditedAmounts: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onToggleExpand: () => void;
  onConfirmToggle: () => void;
  onDelete: () => void;
}) {
  const isConfirmed = card.batchConfirmation?.confirm_status === "CONFIRMED";
  const anomalyCount = card.transactions.filter(isAnomaly).length;
  const totalSuspense = card.transactions.reduce((s, tx) => s + (tx.suspense_amount || 0), 0);
  const cardCurrency = card.transactions[0]?.currency || card.currency;

  return (
    <section className="bg-white border border-[#e6e8ef] rounded-xl shadow-sm overflow-hidden">
      {/* 卡片標題列（可點擊展開/收合） */}
      <div
        className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-[#f8f9fc] transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`material-symbols-outlined text-[#7a7d85] transition-transform duration-200 ${card.expanded ? "rotate-90" : ""}`}>
            chevron_right
          </span>
          <span className="material-symbols-outlined text-[#2563EB]">folder_open</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#1b1b1e]">批號 {card.batchNo}</span>
              <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium border ${
                isConfirmed
                  ? "bg-[#DCFCE7] text-[#166534] border-[#86efac]"
                  : "bg-[#FEF3C7] text-[#b45309] border-[#fde68a]"
              }`}>
                {isConfirmed ? "已確認" : "未確認"}
              </span>
              {anomalyCount > 0 && (
                <span className="px-2.5 py-0.5 text-xs rounded-full font-medium bg-[#FEE2E2] text-[#991B1B] border border-[#fecaca] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  {anomalyCount} 筆異常
                </span>
              )}
            </div>
            <p className="text-xs text-[#7a7d85] mt-0.5">
              {card.suspenseDate}・{CURRENCY_NAME[cardCurrency] || cardCurrency}・共 {card.transactions.length} 筆
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
          <div className="text-right hidden sm:block">
            <p className="text-[11px] text-[#7a7d85]">總立暫收金額</p>
            <p className={`text-sm font-bold font-mono ${totalSuspense < 0 ? "text-[#991B1B]" : "text-[#1b1b1e]"}`}>
              {formatNumber(totalSuspense, cardCurrency)}
            </p>
          </div>
          <div className="flex items-center gap-2 pl-4 border-l border-[#eef0f4]">
            <label className="text-xs font-medium text-[#44474e] cursor-pointer select-none">批號確認</label>
            <button
              type="button"
              role="switch"
              aria-checked={isConfirmed}
              onClick={onConfirmToggle}
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
          <button
            onClick={onDelete}
            disabled={loading}
            title="刪除整批"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#991B1B] hover:bg-[#FEE2E2] transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </div>

      {/* 明細表（展開時顯示） */}
      {card.expanded && (
        <div className="border-t border-[#e6e8ef]">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f1f4f9] border-b border-[#e6e8ef] text-xs font-semibold text-[#44474e]">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">帳號短碼</th>
                  <th className="px-3 py-3 whitespace-nowrap">帳號用途</th>
                  <th className="px-3 py-3 whitespace-nowrap">幣別</th>
                  <th className="px-3 py-3 whitespace-nowrap">暫收類型</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right">前日公司帳列餘額</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right">前日存摺餘額</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right">今日公司帳列餘額</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right">今日存摺餘額</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right text-[#031635]">立暫收金額</th>
                  <th className="px-3 py-3 whitespace-nowrap text-right">立暫收金額（記帳幣）</th>
                  <th className="px-3 py-3 whitespace-nowrap">維護人員</th>
                  <th className="px-3 py-3 whitespace-nowrap">維護時間</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-[#eef0f4]">
                {card.transactions.map(tx => {
                  const anomaly = isAnomaly(tx);
                  const editableAmount = !isConfirmed && tx.suspense_type === "MANUAL";

                  return (
                    <tr key={tx.id} className={`transition-colors ${anomaly ? "bg-[#FEF2F2] hover:bg-[#FEE2E2]" : "hover:bg-[#f8f9fc]"}`}>
                      <td className={`px-3 py-2.5 font-medium ${anomaly ? "text-[#991B1B]" : "text-[#1b1b1e]"}`}>
                        <span className="flex items-center gap-1">
                          {anomaly && <span className="material-symbols-outlined text-[16px] text-[#991B1B]">warning</span>}
                          {tx.account_code}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#44474e]">{tx.account_purpose}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.currency === "NTD"
                            ? "bg-[#dadff1] text-[#3a4a78]"
                            : "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]"
                        }`}>
                          {tx.currency}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 bg-[#eef0f4] text-[#44474e] rounded-full text-xs border border-[#dfe2e9]">
                          {SUSPENSE_TYPE_MAP[tx.suspense_type] || tx.suspense_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#44474e]">{formatNumber(tx.prev_company_balance, tx.currency)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#44474e]">{formatNumber(tx.prev_passbook_balance, tx.currency)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${anomaly ? "text-[#991B1B] font-medium" : ""}`}>
                        {formatNumber(tx.today_company_balance, tx.currency)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono ${anomaly ? "text-[#991B1B] font-medium" : ""}`}>
                        {formatNumber(tx.today_passbook_balance, tx.currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right p-1">
                        {editableAmount ? (
                          <input
                            type="text"
                            value={editedAmounts[tx.id] !== undefined ? editedAmounts[tx.id] : formatNumber(tx.suspense_amount, tx.currency)}
                            onChange={e => setEditedAmounts(prev => ({ ...prev, [tx.id]: e.target.value }))}
                            className={`w-full text-right font-mono border rounded-lg bg-white px-2 py-1.5 shadow-sm font-medium focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none ${
                              anomaly ? "border-[#991B1B]" : "border-[#d8dbe3]"
                            }`}
                          />
                        ) : (
                          <span className={`block text-right font-mono font-semibold px-2 py-1.5 ${
                            tx.suspense_amount < 0 ? "text-[#991B1B]" : tx.suspense_amount > 0 ? "text-[#166534]" : "text-[#1b1b1e]"
                          }`}>
                            {formatNumber(tx.suspense_amount, tx.currency)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[#44474e]">{formatNumber(tx.suspense_amount_local, tx.currency)}</td>
                      <td className="px-3 py-2.5 text-[#44474e] text-xs">{tx.updated_by}</td>
                      <td className="px-3 py-2.5 text-[#44474e] text-xs font-mono">
                        {tx.updated_at ? new Date(tx.updated_at).toLocaleTimeString("zh-TW", { hour12: false }) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 bg-[#f8f9fc] border-t border-[#eef0f4] text-xs text-[#7a7d85]">
            共 {card.transactions.length} 筆明細
            {isConfirmed && "・批號已確認，立暫收金額不可修改"}
          </div>
        </div>
      )}
    </section>
  );
}
