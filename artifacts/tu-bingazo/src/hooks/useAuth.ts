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
  needs_ci_upload: boolean;
  rejection_reason: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  admin_permissions: string[];
  must_change_password: boolean;
  temp_password_expires_at: string | null;
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

// Raw store reference for use outside React components (e.g. fetch interceptor)
export const authStore = useAuthStore;

// Wire the API client to always read from localStorage
setAuthTokenGetter(() => localStorage.getItem("token"));
