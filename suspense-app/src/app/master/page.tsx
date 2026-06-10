"use client";

import { useEffect, useState } from "react";
import { PageShell, PageHeader, Card, CardHeader, EmptyState } from "@/components/ui";

interface BankAccount {
  id: number;
  account_code: string;
  account_long_code: string;
  bank_code: string;
  account_name: string;
  account_purpose: string;
  is_suspense: number;
  is_policy_account: number;
  currency_type: string;
}

interface ManagedAccount {
  account_code: string;
  account_name: string | null;
  manager_type: string;
  valid_from: string | null;
  valid_to: string | null;
}

interface UserRow {
  id: number;
  user_code: string;
  user_name: string;
  role: string;
  accounts: ManagedAccount[];
}

const ROLE_LABEL: Record<string, string> = { STAFF: "經辦", MANAGER: "主管" };
const MGR_TYPE_LABEL: Record<string, string> = { PRIMARY: "主辦", AGENT: "代理" };
const CURRENCY_TYPE_LABEL: Record<string, string> = { TWD: "本國幣 (TWD)", FOREIGN: "外幣" };

function FlagIcon({ on }: { on: boolean }) {
  return on
    ? <span className="material-symbols-outlined text-[18px] text-[#15803d]">check_circle</span>
    : <span className="text-[#cbd5e1]">—</span>;
}

export default function MasterPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/master")
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts ?? []);
        setUsers(data.users ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <PageHeader
        group="設定維護"
        title="基本資料維護"
        description="檢視銀行存款帳號基本資料，以及使用者帳號與帳號維護權限（主辦／代理）。"
      />

      {/* 銀行存款帳號基本資料 */}
      <Card className="overflow-hidden">
        <CardHeader
          icon="account_balance"
          title="銀行存款帳號基本資料"
          right={<span className="text-xs text-[#7a7d85] bg-[#f1f5f9] px-2.5 py-1 rounded-full">共 {accounts.length} 個帳號</span>}
        />
        {loading ? (
          <EmptyState icon="hourglass_top" title="載入中…" />
        ) : accounts.length === 0 ? (
          <EmptyState icon="account_balance" title="無帳號資料" />
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f8fafc] border-b border-[#e6e8ef] text-xs font-semibold text-[#475569]">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">帳號短碼</th>
                  <th className="px-4 py-3 whitespace-nowrap">完整帳號</th>
                  <th className="px-4 py-3 whitespace-nowrap">銀行代碼</th>
                  <th className="px-4 py-3 whitespace-nowrap">帳戶名稱</th>
                  <th className="px-4 py-3 whitespace-nowrap">帳號用途</th>
                  <th className="px-4 py-3 whitespace-nowrap">幣別屬性</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">暫收帳戶</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">保單帳戶</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-[#eef0f4]">
                {accounts.map(a => (
                  <tr key={a.id} className="hover:bg-[#f8f9fc] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[#0f172a]">{a.account_code}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-[#44474e]">{a.account_long_code}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 bg-[#f1f5f9] text-[#475569] rounded-md text-xs font-mono">{a.bank_code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#44474e]">{a.account_name}</td>
                    <td className="px-4 py-2.5 text-[#44474e]">{a.account_purpose}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        a.currency_type === "TWD" ? "bg-[#dadff1] text-[#3a4a78]" : "bg-[#e0f2fe] text-[#0369a1]"
                      }`}>
                        {CURRENCY_TYPE_LABEL[a.currency_type] || a.currency_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center"><FlagIcon on={!!a.is_suspense} /></td>
                    <td className="px-4 py-2.5 text-center"><FlagIcon on={!!a.is_policy_account} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 使用者帳號與權限 */}
      <Card className="overflow-hidden">
        <CardHeader
          icon="manage_accounts"
          title="使用者帳號與帳號維護權限"
          right={<span className="text-xs text-[#7a7d85] bg-[#f1f5f9] px-2.5 py-1 rounded-full">共 {users.length} 位使用者</span>}
        />
        {loading ? (
          <EmptyState icon="hourglass_top" title="載入中…" />
        ) : users.length === 0 ? (
          <EmptyState icon="manage_accounts" title="無使用者資料" />
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f8fafc] border-b border-[#e6e8ef] text-xs font-semibold text-[#475569]">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">使用者代碼</th>
                  <th className="px-4 py-3 whitespace-nowrap">姓名</th>
                  <th className="px-4 py-3 whitespace-nowrap">角色</th>
                  <th className="px-4 py-3">可維護帳號（主辦／代理）</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-[#eef0f4]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-[#f8f9fc] transition-colors align-top">
                    <td className="px-4 py-3 font-medium text-[#0f172a]">{u.user_code}</td>
                    <td className="px-4 py-3 text-[#44474e]">{u.user_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        u.role === "MANAGER" ? "bg-[#ede9fe] text-[#6d28d9]" : "bg-[#dbeafe] text-[#1d4ed8]"
                      }`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "MANAGER" ? (
                        <span className="inline-flex items-center gap-1 text-[#6d28d9] text-xs bg-[#f5f3ff] px-2 py-0.5 rounded-md border border-[#ede9fe]">
                          <span className="material-symbols-outlined text-[14px]">visibility</span>全部帳號（不限）
                        </span>
                      ) : u.accounts.length === 0 ? (
                        <span className="text-[#9aa0ad] text-xs">未指派帳號</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {u.accounts.map((m, i) => (
                            <span
                              key={`${m.account_code}-${m.manager_type}-${i}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${
                                m.manager_type === "PRIMARY"
                                  ? "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]"
                                  : "bg-[#fffbeb] text-[#b45309] border-[#fde68a]"
                              }`}
                              title={m.account_name || ""}
                            >
                              <span className="font-medium">{m.account_code}</span>
                              <span className="opacity-70">{MGR_TYPE_LABEL[m.manager_type] || m.manager_type}</span>
                              {m.manager_type === "AGENT" && (m.valid_from || m.valid_to) && (
                                <span className="opacity-70">（{m.valid_from || "—"}~{m.valid_to || "—"}）</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
