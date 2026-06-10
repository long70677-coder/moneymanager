"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** 頁面主容器：扣除固定側欄（w-64）與頂部列（h-16）的版位 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="mt-16 ml-64 p-8 flex flex-col gap-6 flex-1 min-h-[calc(100vh-4rem)]">
      {children}
    </main>
  );
}

/** 頁面標題區：麵包屑＋大標＋說明 */
export function PageHeader({
  group,
  title,
  description,
  children,
}: {
  group: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-[#7a7d85] mb-1.5 flex items-center gap-1">
        <span>{group}</span>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-[#2563EB] font-medium">{title}</span>
      </p>
      <h2 className="text-[26px] font-bold text-[#0f172a] tracking-tight">{title}</h2>
      {description && (
        <p className="text-sm text-[#64748b] mt-1.5 max-w-3xl leading-relaxed">{description}</p>
      )}
      {children}
    </div>
  );
}

/** 內容卡片 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`bg-white border border-[#e6e8ef] rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`}
    >
      {children}
    </section>
  );
}

/** 卡片標題列：圖示徽章＋標題＋右側動作 */
export function CardHeader({
  icon,
  title,
  right,
}: {
  icon: string;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="px-5 py-4 flex items-center gap-3 border-b border-[#eef0f4]">
      <span className="w-8 h-8 rounded-lg bg-[#eff4ff] text-[#2563EB] flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </span>
      <h3 className="text-sm font-semibold text-[#0f172a]">{title}</h3>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

const BTN_VARIANTS = {
  primary: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm shadow-blue-600/25",
  secondary: "bg-white border border-[#d8dbe3] hover:border-[#b9c0cf] hover:bg-[#f8fafc] text-[#1e293b]",
  danger: "bg-white border border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2]",
} as const;

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof BTN_VARIANTS;
  icon?: string;
  size?: "md" | "sm";
}

/** 統一按鈕 */
export function Btn({ variant = "secondary", icon, size = "md", className = "", children, ...rest }: BtnProps) {
  const sizeCls = size === "sm" ? "h-9 px-3" : "h-10 px-4";
  return (
    <button
      {...rest}
      className={`${sizeCls} rounded-lg font-medium text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BTN_VARIANTS[variant]} ${className}`}
    >
      {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
      {children}
    </button>
  );
}

/** 浮動通知（右上角，自動由呼叫端清除） */
export function Toast({
  type,
  text,
  html = false,
  onClose,
}: {
  type: "success" | "error";
  text: string;
  html?: boolean;
  onClose: () => void;
}) {
  const ok = type === "success";
  return (
    <div
      className={`fixed top-20 right-6 z-50 w-[min(30rem,calc(100vw-3rem))] animate-toast-in flex items-start gap-2.5 p-4 rounded-xl border bg-white shadow-xl shadow-slate-900/10 text-sm ${
        ok ? "border-[#bbf7d0] text-[#166534]" : "border-[#fecaca] text-[#991B1B]"
      }`}
    >
      <span className={`material-symbols-outlined text-[20px] mt-px ${ok ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
        {ok ? "task_alt" : "error"}
      </span>
      {html ? (
        <span className="flex-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
      ) : (
        <span className="flex-1 leading-relaxed break-all">{text}</span>
      )}
      <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] transition-colors shrink-0">
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}

const STAT_TONES = {
  default: "text-[#0f172a]",
  blue: "text-[#2563EB]",
  red: "text-[#b91c1c]",
  amber: "text-[#b45309]",
  green: "text-[#15803d]",
} as const;

/** 小型統計卡 */
export function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: ReactNode;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="bg-white border border-[#e6e8ef] rounded-xl px-4 py-3 flex items-center gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <span className="w-9 h-9 rounded-lg bg-[#f1f5f9] text-[#64748b] flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </span>
      <div className="leading-tight">
        <p className="text-[11px] text-[#7a7d85]">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${STAT_TONES[tone]}`}>{value}</p>
      </div>
    </div>
  );
}

/** 空狀態 */
export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#f1f5f9] to-[#e8edf5] flex items-center justify-center mb-4 ring-1 ring-[#e2e8f0]">
        <span className="material-symbols-outlined text-[30px] text-[#94a3b8]">{icon}</span>
      </div>
      <p className="text-[#334155] font-medium">{title}</p>
      {hint && <p className="text-sm text-[#94a3b8] mt-1 max-w-md leading-relaxed">{hint}</p>}
    </div>
  );
}

/** 置中對話框 */
export function Modal({
  icon,
  title,
  onClose,
  children,
  footer,
}: {
  icon: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[82vh] flex flex-col animate-toast-in overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-[#eef0f4] shrink-0">
          <span className="w-8 h-8 rounded-lg bg-[#eff4ff] text-[#2563EB] flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
          </span>
          <h3 className="text-sm font-semibold text-[#0f172a]">{title}</h3>
          <button onClick={onClose} className="ml-auto text-[#94a3b8] hover:text-[#475569] transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-[#eef0f4] flex justify-end gap-2 shrink-0 bg-[#fafbfd]">{footer}</div>}
      </div>
    </div>
  );
}
