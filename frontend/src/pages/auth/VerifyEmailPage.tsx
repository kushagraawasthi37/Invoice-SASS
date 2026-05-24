import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';

type State = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      setErrorMsg('No verification token found. Please use the link from your email.');
      return;
    }

    apiClient
      .get(`/auth/verify-email`, { params: { token }, validateStatus: () => true })
      .then((res) => {
        if (res.data?.success) {
          setState('success');
          setTimeout(() => navigate('/login?verified=true', { replace: true }), 2000);
        } else {
          const msg = (res.data as { message?: string })?.message;
          setState('error');
          setErrorMsg(msg || 'Invalid or expired verification link.');
        }
      })
      .catch(() => {
        setState('error');
        setErrorMsg('Something went wrong. Please try again.');
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif text-xl text-brand-600 font-semibold">InvoiceFlow</span>
        </div>

        {state === 'verifying' && (
          <motion.div
            key="verifying"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
            <h1 className="font-serif text-2xl tracking-tight">Verifying your email…</h1>
            <p className="text-sm text-muted-foreground">Just a moment while we confirm your account.</p>
          </motion.div>
        )}

        {state === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="font-serif text-2xl tracking-tight text-emerald-800">Email verified!</h1>
            <p className="text-sm text-muted-foreground">
              Your account is confirmed. Redirecting you to sign in…
            </p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Redirecting…</span>
            </div>
          </motion.div>
        )}

        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="font-serif text-2xl tracking-tight">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild>
                <Link to="/login">Go to sign in</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/signup">Create new account</Link>
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
