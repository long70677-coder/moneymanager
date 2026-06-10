"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import UserSwitcher from "./UserSwitcher";

const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: "/balances", title: "存摺餘額轉檔" },
  { prefix: "/suspense", title: "暫收交易作業" },
  { prefix: "/master", title: "基本資料維護" },
  { prefix: "/bank-formats", title: "銀行格式設定" },
];

export default function Topbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES.find(p => pathname.startsWith(p.prefix))?.title ?? "資金管理系統";

  // 日期於 client 端掛載後才顯示，避免 SSR/CSR 時間不一致
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }),
    );
  }, []);

  return (
    <header className="bg-white/85 backdrop-blur border-b border-[#e6e8ef] flex justify-between items-center h-16 px-8 w-[calc(100%-16rem)] ml-64 fixed top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="font-bold text-[#031635] tracking-tight text-[15px]">{title}</span>
        {today && (
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#f1f5f9] text-[#475569] rounded-full text-xs">
            <span className="material-symbols-outlined text-[15px]">calendar_today</span>
            {today}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-medium hidden sm:flex items-center gap-1">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>系統運作正常
        </span>
        <UserSwitcher />
      </div>
    </header>
  );
}
