import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  activeModal: string | null;
  notificationBadgeCount: number;
  toggleSidebar: () => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  setNotificationBadgeCount: (count: number) => void;
}

/**
 * Store state UI (sidebar admin, modal aktif, badge notifikasi). Ephemeral.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  activeModal: null,
  notificationBadgeCount: 0,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
  setNotificationBadgeCount: (notificationBadgeCount) => set({ notificationBadgeCount }),
}));
