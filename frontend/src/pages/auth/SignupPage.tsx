import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Zap, CheckCircle, Mail, RefreshCw, AlertCircle } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
});

type FormData = z.infer<typeof schema>;

const RESEND_COOLDOWN = 60;
const MAX_RESENDS = 5;

const perks = [
  '5 free invoice PDF downloads/month',
  'NDIS compliance checklist',
  'Professional templates',
  'Email handoff workflow',
];

// ── Check-your-email screen ────────────────────────────────────────────────────

function CheckEmailScreen({ email, name }: { email: string; name: string }) {
  const { success, error, warning } = useToast();
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [resendCount, setResendCount] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, []);

  const handleResend = async () => {
    if (countdown > 0 || resendCount >= MAX_RESENDS || isResending) return;
    setIsResending(true);
    try {
      await authApi.resendVerification(email);
      const next = resendCount + 1;
      setResendCount(next);

      if (next >= MAX_RESENDS) {
        warning('Limit reached', `You've sent ${MAX_RESENDS} verification emails. Check your spam folder or contact support.`);
      } else {
        success('Email sent!', `Verification email resent to ${email}.`);
      }

      setCountdown(RESEND_COOLDOWN);
      intervalRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(intervalRef.current!); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      error('Resend failed', extractError(err));
    } finally {
      setIsResending(false);
    }
  };

  const canResend = countdown === 0 && resendCount < MAX_RESENDS && !isResending;
  const resentsLeft = MAX_RESENDS - resendCount;

  return (
    <motion.div
      key="check-email"
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

      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
          <Mail className="w-8 h-8 text-brand-500" />
        </div>
        <h1 className="font-serif text-3xl tracking-tight mb-2">Check your email</h1>
        <p className="text-muted-foreground text-sm">
          We sent a verification link to
        </p>
        <p className="font-semibold text-sm mt-0.5">{email}</p>
      </div>

      <div className="bg-muted/40 rounded-xl border border-border p-4 mb-6 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
          <span>Click the link in your email to verify your account</span>
        </div>
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <span>Check your spam or junk folder if you don't see it</span>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full gap-2"
          onClick={handleResend}
          disabled={!canResend}
          loading={isResending}
          variant={canResend ? 'default' : 'outline'}
        >
          <RefreshCw className="w-4 h-4" />
          {isResending
            ? 'Sending…'
            : countdown > 0
              ? `Resend in ${countdown}s`
              : resendCount >= MAX_RESENDS
                ? 'Resend limit reached'
                : 'Resend verification email'}
        </Button>

        {resendCount > 0 && resentsLeft > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {resentsLeft} resend{resentsLeft !== 1 ? 's' : ''} remaining this hour
          </p>
        )}
        {resendCount >= MAX_RESENDS && (
          <p className="text-center text-xs text-destructive">
            Resend limit reached. Check spam or contact support.
          </p>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already verified?{' '}
        <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
      </p>
    </motion.div>
  );
}

// ── Main SignupPage ────────────────────────────────────────────────────────────

export function SignupPage() {
  const { error } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<{ email: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const result = await authApi.register(data.name, data.email, data.password);
      if (result.requiresVerification) {
        setPendingEmail({ email: result.email, name: result.name });
      }
    } catch (err) {
      error('Sign up failed', extractError(err));
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left */}
      <div className="hidden lg:flex lg:w-[440px] xl:w-[520px] flex-col justify-between bg-[#1a1814] p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif text-xl text-white font-semibold">InvoiceFlow</span>
        </div>

        <div>
          <h2 className="text-white text-3xl font-serif font-semibold leading-tight mb-4">
            Start managing invoices the right way.
          </h2>
          <p className="text-white/60 text-sm mb-8">
            Purpose-built for NDIS support workers. No accounting degree needed.
          </p>
          <div className="space-y-3">
            {perks.map((perk) => (
              <div key={perk} className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />
                <span className="text-white/80 text-sm">{perk}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-white/40 text-xs">
          No credit card required · Cancel anytime
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {pendingEmail ? (
            <CheckEmailScreen key="check" email={pendingEmail.email} name={pendingEmail.name} />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="w-full max-w-[400px]"
            >
              <div className="flex items-center gap-2.5 mb-8 lg:hidden">
                <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="font-serif text-lg text-brand-600 font-semibold">InvoiceFlow</span>
              </div>

              <h1 className="font-serif text-3xl tracking-tight mb-2">Create your account</h1>
              <p className="text-muted-foreground text-sm mb-8">
                Free forever — upgrade for unlimited PDFs.
              </p>

              <div className="relative mb-6">
                <Button
                  variant="outline"
                  className="w-full h-11 gap-2.5 opacity-50 cursor-not-allowed"
                  type="button"
                  disabled
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign up with Google
                </Button>
                <span className="absolute -top-2.5 right-3 bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 pointer-events-none">
                  Coming soon
                </span>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs text-muted-foreground">or sign up with email</span>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" placeholder="Jane Smith" autoComplete="name" error={!!errors.name} {...register('name')} />
                  {errors.name && (
                    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" error={!!errors.email} {...register('email')} />
                  {errors.email && (
                    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      autoComplete="new-password"
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
                    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.password.message}
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11" loading={isSubmitting}>
                  Create account
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                By signing up you agree to our{' '}
                <a href="#" className="underline hover:text-foreground">Terms</a>
                {' '}and{' '}
                <a href="#" className="underline hover:text-foreground">Privacy Policy</a>
              </p>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
