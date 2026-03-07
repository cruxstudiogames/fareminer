import { create } from 'zustand';
import type { AuthUser } from '../services/authService';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setCredits: (credits: number) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: user !== null,
      isAdmin: user?.isAdmin ?? false,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setCredits: (credits) =>
    set((state) => ({
      user: state.user ? { ...state.user, credits } : null,
    })),

  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
    }),
}));
