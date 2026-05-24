import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FileText, Quote, ShoppingCart, LayoutTemplate,
  Settings, CreditCard, ChevronLeft, Zap, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/invoices', icon: FileText, label: 'Invoices' },
  { href: '/quotes', icon: Quote, label: 'Quotations' },
  { href: '/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
  { href: '/templates', icon: LayoutTemplate, label: 'Templates' },
];

const bottomItems = [
  { href: '/billing', icon: CreditCard, label: 'Billing' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

function useIsMobile() {
  const { setSidebarOpen } = useUiStore();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );

  useEffect(() => {
    let prev = window.innerWidth < 1024;
    const handler = () => {
      const now = window.innerWidth < 1024;
      if (now !== prev) {
        prev = now;
        setIsMobile(now);
        // switching to desktop → open sidebar; switching to mobile → close
        setSidebarOpen(!now);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [setSidebarOpen]);

  return isMobile;
}

export function Sidebar() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const isMobile = useIsMobile();

  // Close drawer on nav on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile, setSidebarOpen]);

  const navContent = (expanded: boolean) => (
    <>
      {/* Brand */}
      <div className="flex items-center h-[60px] px-4 border-b border-border flex-shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="font-serif text-[17px] text-brand-600 font-semibold whitespace-nowrap overflow-hidden"
              >
                InvoiceFlow
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {isMobile ? (
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <motion.button
            onClick={() => setSidebarOpen(!expanded)}
            className="ml-auto p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div animate={{ rotate: expanded ? 0 : 180 }}>
              <ChevronLeft className="w-4 h-4" />
            </motion.div>
          </motion.button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active = location.pathname === item.href ||
            (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className={cn(
                'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                active ? 'text-brand-600' : 'group-hover:text-foreground',
              )} />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r-full"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        {bottomItems.map((item) => {
          const active = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2.5 mt-1">
          <div className="w-[18px] h-[18px] rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 text-brand-700 font-semibold text-[10px]">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-w-0 flex-1"
              >
                <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <motion.aside
          initial={false}
          animate={{ x: sidebarOpen ? 0 : '-100%' }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="fixed left-0 top-0 z-30 h-full w-[240px] flex flex-col bg-card border-r border-border"
        >
          {navContent(true)}
        </motion.aside>
      </>
    );
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 240 : 64 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative flex-shrink-0 h-full flex flex-col bg-card border-r border-border overflow-hidden"
    >
      {navContent(sidebarOpen)}
    </motion.aside>
  );
}
