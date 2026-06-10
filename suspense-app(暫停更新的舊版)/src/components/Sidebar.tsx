"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "日常作業",
    items: [
      { icon: "savings", label: "存摺餘額轉檔", href: "/balances", desc: "FUN2.1.1" },
      { icon: "history_edu", label: "暫收交易", href: "/suspense", desc: "FUN2.1.2" },
    ],
  },
  {
    label: "設定維護",
    items: [
      { icon: "database", label: "基本資料維護", href: "/master", desc: "帳號・權限" },
      { icon: "tune", label: "銀行格式設定", href: "/bank-formats", desc: "轉檔格式" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="bg-gradient-to-b from-[#0a1f44] via-[#081a3a] to-[#031027] text-[#dde2f4] h-screen w-64 fixed left-0 top-0 flex flex-col z-20 shadow-xl">
      {/* 品牌 */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1a3a7a] flex items-center justify-center shrink-0 ring-1 ring-white/20 shadow-lg shadow-blue-900/40">
          <span className="material-symbols-outlined text-white text-[22px]">account_balance</span>
        </div>
        <div>
          <h1 className="font-bold text-white tracking-tight leading-tight">資金管理系統</h1>
          <p className="text-[11px] text-[#8fa3cd] tracking-wide">銀行存款・後台作業</p>
        </div>
      </div>

      {/* 導覽 */}
      <div className="flex-1 py-4 flex flex-col gap-5 px-3 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-widest text-[#5f74a3]">
              {group.label}
            </p>
            {group.items.map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    active
                      ? "bg-white/12 text-white font-medium ring-1 ring-white/15 shadow-sm"
                      : "text-[#a3b2d6] hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      active ? "bg-[#2563EB] text-white shadow shadow-blue-900/50" : "bg-white/6 text-[#8fa3cd] group-hover:text-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
                  </span>
                  <span className="flex-1 leading-tight">
                    {item.label}
                    <span className={`block text-[10px] font-normal tracking-wide ${active ? "text-[#a9c2f2]" : "text-[#5f74a3]"}`}>
                      {item.desc}
                    </span>
                  </span>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-[#7da2ee]" />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* 底部資訊 */}
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-[11px] text-[#5f74a3] leading-relaxed">
          suspense-app・FUN2.1 模組
          <br />
          人機共同維護・架構準則 ARCHITECTURE.md
        </p>
      </div>
    </nav>
  );
}
