import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "暫收交易 - FinOps Back-Office",
  description: "銀行存款資金管理系統 - 暫收交易模組",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`${inter.className} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[#fbf8fc] text-[#1b1b1e]">
        {/* Side Nav */}
        <nav className="bg-[#031635] text-[#dde2f4] h-screen w-64 fixed left-0 top-0 border-r border-[#364768]/20 flex flex-col z-20">
          <div className="p-6 border-b border-[#364768]/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1a2b4b] flex items-center justify-center overflow-hidden shrink-0">
              <span className="material-symbols-outlined text-[#8293b8]">account_balance</span>
            </div>
            <div>
              <h1 className="font-bold text-white tracking-tight">FinOps Core</h1>
              <p className="text-xs text-[#c1c6d8]">Back-Office v4.2</p>
            </div>
          </div>
          <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">dashboard</span>Dashboard
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">account_balance</span>Accounting
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">payments</span>Cash Management
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg border-l-4 border-[#c1c6d8] bg-[#1a2b4b] text-white" href="/suspense">
              <span className="material-symbols-outlined">history_edu</span>Suspense Transactions
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">settings</span>Settings
            </a>
          </div>
          <div className="p-3 border-t border-[#364768]/20 flex flex-col gap-1">
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">help</span>Support
            </a>
            <a className="flex items-center gap-3 px-3 py-2 rounded-lg text-[#364768] opacity-80 hover:bg-[#1a2b4b] hover:text-white transition-colors" href="#">
              <span className="material-symbols-outlined">logout</span>Logout
            </a>
          </div>
        </nav>

        {/* Top Bar */}
        <header className="bg-[#fbf8fc] border-b border-[#c5c6cf] flex justify-between items-center h-16 px-8 w-[calc(100%-16rem)] ml-64 fixed top-0 z-10">
          <div className="flex items-center gap-6">
            <span className="font-bold text-[#031635]">FinOps Back-Office</span>
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#44474e] text-sm">search</span>
              <input className="w-full pl-9 pr-3 py-1.5 bg-[#f5f3f6] border-none rounded focus:ring-2 focus:ring-[#2563EB] text-sm" placeholder="Search transactions..." type="text" />
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-6 h-full">
            <a className="h-full flex items-center text-[#44474e] hover:text-[#031635]" href="#">Accounting</a>
            <a className="h-full flex items-center text-[#44474e] hover:text-[#031635]" href="#">Cash Management</a>
            <a className="h-full flex items-center text-[#031635] font-bold border-b-2 border-[#031635] pb-1" href="/suspense">Suspense Transactions</a>
          </nav>
          <div className="flex items-center gap-4">
            <span className="px-2 py-1 bg-[#DCFCE7] text-[#166534] rounded text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span>System Healthy
            </span>
            <button className="text-[#44474e] hover:text-[#031635] relative">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#ba1a1a] rounded-full"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-[#1a2b4b] flex items-center justify-center text-white text-xs font-medium">
              SA
            </div>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
