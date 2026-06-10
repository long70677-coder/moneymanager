import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/components/UserProvider";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "銀行存款資金管理系統",
  description: "公司銀行存款資金管理系統 - 後台作業",
};

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
        <UserProvider>
          <Sidebar />
          <Topbar />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
