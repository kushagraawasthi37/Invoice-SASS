import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
  action?: ToastAction;
}

interface UiState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= 1024;

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: isDesktop(),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const addToast = useUiStore((s) => s.addToast);
  return {
    toast: addToast,
    success: (title: string, description?: string) =>
      addToast({ type: 'success', title, description }),
    error: (title: string, description?: string, action?: ToastAction) =>
      addToast({ type: 'error', title, description, action }),
    info: (title: string, description?: string) =>
      addToast({ type: 'info', title, description }),
    warning: (title: string, description?: string) =>
      addToast({ type: 'warning', title, description }),
  };
}
