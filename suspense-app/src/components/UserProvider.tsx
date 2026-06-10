"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User } from "@/lib/types";

interface UserCtx {
  users: User[];
  currentUser: User | null;
  setCurrentUserId: (id: number) => void;
}

const UserContext = createContext<UserCtx | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then(r => r.json())
      .then(d => {
        const list: User[] = d.users || [];
        setUsers(list);
        const saved = typeof window !== "undefined" ? localStorage.getItem("currentUserId") : null;
        const initial = saved ? parseInt(saved) : (list[0]?.id ?? null);
        setCurrentUserIdState(initial);
      })
      .catch(() => {});
  }, []);

  const setCurrentUserId = useCallback((id: number) => {
    setCurrentUserIdState(id);
    if (typeof window !== "undefined") localStorage.setItem("currentUserId", String(id));
  }, []);

  const currentUser = users.find(u => u.id === currentUserId) ?? null;

  return (
    <UserContext.Provider value={{ users, currentUser, setCurrentUserId }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserCtx {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser 必須在 UserProvider 內使用");
  return ctx;
}
