import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';

export function NotFoundPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center max-w-md"
      >
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
        </div>

        <h1 className="font-serif text-[96px] leading-none font-bold text-brand-500 mb-2 select-none">
          404
        </h1>
        <h2 className="font-serif text-2xl tracking-tight text-foreground mb-3">
          Page not found
        </h2>
        <p className="text-muted-foreground text-sm mb-10 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go back
          </Button>
          <Button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login', { replace: true })}
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            {isAuthenticated ? 'Dashboard' : 'Sign in'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
