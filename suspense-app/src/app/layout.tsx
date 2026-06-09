import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "暫收交易 - 銀行存款資金管理系統",
  description: "銀行存款資金管理系統 - 暫收交易模組",
};

const navItems = [
  { icon: "dashboard", label: "總覽儀表板", href: "#", active: false },
  { icon: "account_balance", label: "會計作業", href: "#", active: false },
  { icon: "payments", label: "資金管理", href: "#", active: false },
  { icon: "history_edu", label: "暫收交易", href: "/suspense", active: true },
  { icon: "settings", label: "系統設定", href: "#", active: false },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`${notoSansTC.className} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[#f7f8fb] text-[#1b1b1e]">
        {/* 側邊導覽列 */}
        <nav className="bg-gradient-to-b from-[#0a1f44] to-[#031635] text-[#dde2f4] h-screen w-64 fixed left-0 top-0 flex flex-col z-20 shadow-xl">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-white/15">
              <span className="material-symbols-outlined text-[#9fb4e0]">account_balance</span>
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight leading-tight">資金管理系統</h1>
              <p className="text-[11px] text-[#9fb0d4] tracking-wide">銀行存款・後台作業 v4.2</p>
            </div>
          </div>
          <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
            <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-widest text-[#6f82ad]">功能模組</p>
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  item.active
                    ? "bg-white/12 text-white font-medium ring-1 ring-white/10 border-l-[3px] border-[#7da2ee] pl-2.5"
                    : "text-[#aebbd8] hover:bg-white/8 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </div>
          <div className="p-3 border-t border-white/10 flex flex-col gap-1">
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#aebbd8] hover:bg-white/8 hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined text-[20px]">help</span>支援服務
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#aebbd8] hover:bg-white/8 hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined text-[20px]">logout</span>登出系統
            </a>
          </div>
        </nav>

        {/* 頂部列 */}
        <header className="bg-white/90 backdrop-blur border-b border-[#e6e8ef] flex justify-between items-center h-16 px-8 w-[calc(100%-16rem)] ml-64 fixed top-0 z-10">
          <div className="flex items-center gap-6">
            <span className="font-bold text-[#031635] tracking-tight">暫收交易作業</span>
            <div className="relative w-72 hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa0ad] text-[20px]">search</span>
              <input
                className="w-full pl-10 pr-3 py-2 bg-[#f2f3f7] border border-transparent rounded-lg focus:bg-white focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 text-sm outline-none transition"
                placeholder="搜尋交易、批號、帳號…"
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>系統運作正常
            </span>
            <button className="text-[#44474e] hover:text-[#031635] relative transition-colors">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#ba1a1a] rounded-full ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-[#e6e8ef]">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1a2b4b] to-[#2563EB] flex items-center justify-center text-white text-xs font-bold">
                資管
              </div>
              <div className="hidden lg:block leading-tight">
                <p className="text-sm font-medium text-[#1b1b1e]">資金管理課</p>
                <p className="text-[11px] text-[#7a7d85]">經辦人員</p>
              </div>
            </div>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
