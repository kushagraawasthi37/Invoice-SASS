import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Zap, AlertCircle, CheckCircle, RefreshCw, Mail } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

function UnverifiedBanner({ email }: { email: string }) {
  const { success, error: showError, warning } = useToast();
  const [countdown, setCountdown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [resendCount, setResendCount] = useState(0);

  const handleResend = async () => {
    if (countdown > 0 || resendCount >= 5 || isSending) return;
    setIsSending(true);
    try {
      await authApi.resendVerification(email);
      const next = resendCount + 1;
      setResendCount(next);
      if (next >= 5) {
        warning('Limit reached', 'Check your spam folder or contact support.');
      } else {
        success('Sent!', `Verification link resent to ${email}.`);
      }
      setCountdown(60);
      const interval = setInterval(() => {
        setCountdown((c) => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
      }, 1000);
    } catch (err) {
      showError('Resend failed', extractError(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5"
    >
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Email not verified</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Check your inbox for a link sent to <strong>{email}</strong>
          </p>
          <button
            onClick={handleResend}
            disabled={countdown > 0 || resendCount >= 5 || isSending}
            className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isSending ? 'animate-spin' : ''}`} />
            {isSending ? 'Sending…' : countdown > 0 ? `Resend in ${countdown}s` : resendCount >= 5 ? 'Limit reached' : 'Resend verification email'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
  const { login } = useAuthStore();
  const { success, error } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      success('Email verified!', 'Your account is confirmed. Sign in to get started.');
    }
    if (searchParams.get('error') === 'oauth_failed') {
      error('Google sign-in failed', 'Please try again or use email and password.');
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setUnverifiedEmail(null);
    try {
      const result = await authApi.login(data.email, data.password);
      login(result.user, result.tokens.accessToken, result.tokens.refreshToken);
      success('Welcome back!', `Signed in as ${result.user.name}.`);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(data.email);
        return;
      }
      error('Sign in failed', extractError(err));
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col justify-between bg-brand-500 p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif text-xl text-white font-semibold">InvoiceFlow</span>
        </div>
        <div>
          <blockquote className="text-white/90 text-xl font-light leading-relaxed mb-6">
            "The only invoice tool built specifically for NDIS support workers. Professional, compliant, and beautifully simple."
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20" />
            <div>
              <p className="text-white text-sm font-medium">Sarah Mitchell</p>
              <p className="text-white/60 text-xs">Support Coordinator, Sydney</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { value: '2,400+', label: 'Invoices created' },
            { value: '$1.2M+', label: 'Processed this year' },
            { value: '100%', label: 'NDIS compliant' },
            { value: '4.9 ★', label: 'User satisfaction' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/10 rounded-xl p-4">
              <p className="text-white text-2xl font-bold font-serif">{stat.value}</p>
              <p className="text-white/70 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px]"
        >
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-serif text-lg text-brand-600 font-semibold">InvoiceFlow</span>
          </div>

          <h1 className="font-serif text-3xl tracking-tight mb-2">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Sign in to your account to continue.
          </p>

          {/* Email verified success banner */}
          {searchParams.get('verified') === 'true' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-6"
            >
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Email verified!</p>
                <p className="text-xs text-emerald-700">Your account is confirmed. Sign in below.</p>
              </div>
            </motion.div>
          )}

          <Button
            variant="outline"
            className="w-full h-11 mb-6 gap-2.5"
            type="button"
            onClick={() => window.location.href = authApi.googleUrl()}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">or continue with email</span>
            </div>
          </div>

          {/* Unverified email inline banner */}
          <AnimatePresence>
            {unverifiedEmail && <UnverifiedBanner key={unverifiedEmail} email={unverifiedEmail} />}
          </AnimatePresence>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  error={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full h-11" loading={isSubmitting}>
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="text-brand-600 font-medium hover:underline">
              Create one free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
