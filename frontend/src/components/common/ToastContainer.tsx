import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap = {
  success: { icon: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50', action: 'text-emerald-700' },
  error:   { icon: 'text-red-600',     border: 'border-red-200',     bg: 'bg-red-50',     action: 'text-red-700'   },
  info:    { icon: 'text-blue-600',    border: 'border-blue-200',    bg: 'bg-blue-50',    action: 'text-blue-700'  },
  warning: { icon: 'text-amber-600',   border: 'border-amber-200',   bg: 'bg-amber-50',   action: 'text-amber-700' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore();

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type];
          const colors = colorMap[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93, y: 8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg',
                colors.border,
                colors.bg,
              )}
            >
              <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', colors.icon)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{toast.description}</p>
                )}
                {toast.action && (
                  <button
                    onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
                    className={cn('text-xs font-bold mt-1.5 underline underline-offset-2 hover:no-underline transition-all', colors.action)}
                  >
                    {toast.action.label} →
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-0.5 rounded hover:bg-black/10 text-muted-foreground transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
