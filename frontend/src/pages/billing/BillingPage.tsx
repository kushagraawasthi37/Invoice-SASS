import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Check, CreditCard, Zap, Crown, ExternalLink, AlertCircle, ArrowRight,
} from 'lucide-react';
import { paymentApi } from '@/api/payment.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

const FREE_FEATURES = [
  '5 PDF downloads (lifetime)',
  '1 custom template',
  'Unlimited invoices (draft)',
  'All 3 document types',
  'NDIS compliance checklist',
  'System templates',
  'Signature capture',
];

const PRO_FEATURES = [
  'Unlimited PDF downloads',
  'Unlimited invoices',
  'All 3 document types',
  'NDIS compliance checklist',
  'All system templates',
  'Custom branded templates',
  'Signature capture',
  'Logo upload',
  'Priority support',
];

const FREE_PDF_LIMIT = 5;

export function BillingPage() {
  const { success, error } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: paymentApi.getSubscription,
  });

  const checkoutMutation = useMutation({
    mutationFn: paymentApi.createCheckout,
    onSuccess: (url) => { window.location.href = url; },
    onError: (err) => error('Checkout failed', extractError(err)),
  });

  const portalMutation = useMutation({
    mutationFn: paymentApi.createPortal,
    onSuccess: (url) => { window.open(url, '_blank'); },
    onError: (err) => error('Portal failed', extractError(err)),
  });

  const sub = data?.subscription;
  const usage = data?.usage;
  const isPro = sub?.plan === 'PRO_MONTHLY' || sub?.plan === 'PRO_YEARLY';
  const pdfUsed = usage?.pdfDownloads ?? 0;
  const pdfPct = Math.min((pdfUsed / FREE_PDF_LIMIT) * 100, 100);
  const pdfLimitReached = pdfPct >= 100;

  const planLabel = isPro
    ? (sub?.plan === 'PRO_YEARLY' ? 'Pro Yearly' : 'Pro Monthly')
    : 'Free';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title="Billing"
        subtitle="Manage your plan and subscription."
      />

      <div className="space-y-6">
        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <CardTitle>Current Plan</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  isPro ? 'bg-brand-500' : 'bg-muted',
                )}>
                  {isPro
                    ? <Crown className="w-5 h-5 text-white" />
                    : <Zap className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{planLabel}</p>
                    {isPro && <Badge variant="paid" className="text-[10px]">Active</Badge>}
                    {!isPro && <Badge variant="outline" className="text-[10px]">Free Tier</Badge>}
                  </div>
                  {sub?.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sub.cancelAtPeriodEnd
                        ? `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                        : `Renews on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
              </div>
              {isPro && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full sm:w-auto"
                  loading={portalMutation.isPending}
                  onClick={() => portalMutation.mutate()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Manage Subscription
                </Button>
              )}
            </div>

            {/* PDF usage bar (free only) */}
            {!isPro && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">PDF Downloads</p>
                  <p className={cn('text-sm font-semibold tabular-nums', pdfLimitReached ? 'text-destructive' : 'text-muted-foreground')}>
                    {pdfUsed} / {FREE_PDF_LIMIT}
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      pdfLimitReached ? 'bg-destructive' : pdfPct >= 80 ? 'bg-amber-500' : 'bg-brand-500',
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${pdfPct}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
                {pdfLimitReached ? (
                  <div className="flex items-center gap-1.5 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                    <p className="text-xs text-destructive font-medium">
                      PDF limit reached. Upgrade to Pro for unlimited downloads.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {FREE_PDF_LIMIT - pdfUsed} download{FREE_PDF_LIMIT - pdfUsed !== 1 ? 's' : ''} remaining on free plan.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upgrade Plans */}
        {!isPro && (
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-brand-500" />
              Upgrade to Pro
            </h2>

            {/* Alert when limit reached */}
            {pdfLimitReached && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">PDF download limit reached</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    You've used all 5 free PDF downloads. Upgrade to Pro to generate unlimited PDFs.
                  </p>
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pro Monthly */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Card className="border-brand-200 hover:shadow-card-hover transition-shadow h-full">
                  <CardContent className="p-5 sm:p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-base sm:text-lg">Pro Monthly</p>
                        <p className="text-2xl sm:text-3xl font-bold mt-1">
                          $29 <span className="text-sm font-normal text-muted-foreground">AUD/mo</span>
                        </p>
                      </div>
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                    </div>
                    <ul className="space-y-2 mb-5 flex-1">
                      {PRO_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full gap-2"
                      loading={checkoutMutation.isPending && checkoutMutation.variables === 'PRO_MONTHLY'}
                      onClick={() => checkoutMutation.mutate('PRO_MONTHLY')}
                    >
                      Upgrade Monthly
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Pro Yearly */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="relative border-brand-400 ring-1 ring-brand-400 hover:shadow-card-hover transition-shadow h-full">
                  <div className="absolute top-3 right-3 z-10">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                      Save 17%
                    </span>
                  </div>
                  <CardContent className="p-5 sm:p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="font-semibold text-base sm:text-lg">Pro Yearly</p>
                        <p className="text-2xl sm:text-3xl font-bold mt-1">
                          $290 <span className="text-sm font-normal text-muted-foreground">AUD/yr</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">~$24.17/mo</p>
                      </div>
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                    </div>
                    <ul className="space-y-2 mb-5 flex-1">
                      {PRO_FEATURES.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="w-3.5 h-3.5 text-brand-500 flex-shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="brand"
                      className="w-full gap-2"
                      loading={checkoutMutation.isPending && checkoutMutation.variables === 'PRO_YEARLY'}
                      onClick={() => checkoutMutation.mutate('PRO_YEARLY')}
                    >
                      Upgrade Yearly
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        )}

        {/* Free plan inclusions */}
        {!isPro && (
          <Card className="bg-muted/30">
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Included on Free Plan
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 flex-shrink-0 text-brand-400" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pro plan inclusions (when on Pro) */}
        {isPro && (
          <Card className="bg-brand-50 border-brand-200">
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-3">
                Your Pro Features
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                {PRO_FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-brand-800">
                    <Check className="w-3.5 h-3.5 flex-shrink-0 text-brand-500" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
