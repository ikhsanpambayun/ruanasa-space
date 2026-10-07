import { create } from 'zustand';

import type { AuthUser } from '@/types/user';

interface AuthState {
  user: AuthUser | null;
  /** Token fallback untuk header Bearer. Cookie httpOnly tetap jalur utama. */
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthUser, token?: string | null) => void;
  clearAuth: () => void;
}

/**
 * Store autentikasi (user, token fallback, status login). Tidak dipersist: sumber utama adalah cookie httpOnly.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  setAuth: (user, token = null) => set({ user, token, isAuthenticated: true }),
  clearAuth: () => set({ user: null, token: null, isAuthenticated: false }),
}));
