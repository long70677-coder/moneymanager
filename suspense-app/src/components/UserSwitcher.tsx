"use client";

import { useUser } from "./UserProvider";
import { ROLE_MAP } from "@/lib/types";

export default function UserSwitcher() {
  const { users, currentUser, setCurrentUserId } = useUser();

  return (
    <div className="flex items-center gap-2 pl-3 border-l border-[#e6e8ef]">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ${
        currentUser?.role === "MANAGER"
          ? "bg-gradient-to-br from-[#7c3aed] to-[#2563EB]"
          : "bg-gradient-to-br from-[#1a2b4b] to-[#2563EB]"
      }`}>
        {currentUser ? currentUser.user_name.slice(0, 1) : "?"}
      </div>
      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <select
            value={currentUser?.id ?? ""}
            onChange={e => setCurrentUserId(parseInt(e.target.value))}
            className="text-sm font-medium text-[#1b1b1e] bg-transparent outline-none cursor-pointer hover:text-[#2563EB] -ml-0.5"
            title="切換目前操作者（demo 用，正式版改為登入）"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.user_name}</option>
            ))}
          </select>
          {currentUser && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              currentUser.role === "MANAGER"
                ? "bg-[#ede9fe] text-[#6d28d9]"
                : "bg-[#dbeafe] text-[#1d4ed8]"
            }`}>
              {ROLE_MAP[currentUser.role]}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#7a7d85]">點選姓名可切換操作者</p>
      </div>
    </div>
  );
}
