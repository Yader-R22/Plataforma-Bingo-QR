import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthUser {
  id: number;
  full_name: string;
  ci: string;
  phone: string;
  department: string;
  balance: number;
  status: "pending" | "active" | "rejected";
  is_admin: boolean;
  avatar_url: string | null;
  id_photo_front_url: string | null;
  id_photo_back_url: string | null;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        set({ token, user });
        localStorage.setItem("token", token);
      },
      setUser: (user) => set({ user }),
      logout: () => {
        set({ token: null, user: null });
        localStorage.removeItem("token");
      },
    }),
    {
      name: "tb-auth",
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);

// Wire the API client to always read from localStorage
setAuthTokenGetter(() => localStorage.getItem("token"));
