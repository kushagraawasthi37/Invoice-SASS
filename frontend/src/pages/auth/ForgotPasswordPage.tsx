import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Zap } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormData = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    await authApi.forgotPassword(data.email).catch(() => {});
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[400px]"
      >
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-serif text-lg text-brand-600 font-semibold">InvoiceFlow</span>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-brand-500" />
            </div>
            <h1 className="font-serif text-2xl mb-2">Check your inbox</h1>
            <p className="text-muted-foreground text-sm mb-8">
              If that email exists, we've sent a reset link. Check your spam folder if you don't see it.
            </p>
            <Link to="/login">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-3xl tracking-tight mb-2">Forgot password?</h1>
            <p className="text-muted-foreground text-sm mb-8">
              Enter your email and we'll send you a reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" error={!!errors.email} {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full h-11" loading={isSubmitting}>
                Send reset link
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to login
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
