import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Search, Download, Edit, Copy, Trash2, FileText,
  ChevronLeft, ChevronRight, AlertCircle, Crown,
} from 'lucide-react';
import { invoiceApi, PaymentRequiredError } from '@/api/invoice.api';
import { paymentApi } from '@/api/payment.api';
import { templateApi } from '@/api/template.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { DownloadFormatDialog } from '@/components/invoices/DownloadFormatDialog';
import { formatMoney, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Paid' },
  { value: 'VOID', label: 'Void' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const FREE_PDF_LIMIT = 5;

export function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [dialogInvoice, setDialogInvoice] = useState<{ id: string; number: string } | null>(null);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<string | null | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { search, status, page }],
    queryFn: () => invoiceApi.list({ search: search || undefined, status, page, limit: 20 }),
    placeholderData: (prev) => prev,
  });

  const { data: billingData } = useQuery({
    queryKey: ['billing'],
    queryFn: paymentApi.getSubscription,
    staleTime: 30000,
  });

  // Prefetch templates to know if dialog is needed
  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    staleTime: 60_000,
  });

  const hasCustomTemplates = (templates ?? []).some((t) => t.analysisStatus === 'READY');

  const isPro = billingData?.subscription?.plan !== 'FREE' &&
    (billingData?.subscription?.status === 'ACTIVE' || billingData?.subscription?.status === 'TRIALING');
  const pdfUsed = billingData?.usage?.pdfDownloads ?? 0;
  const pdfLimitReached = !isPro && pdfUsed >= FREE_PDF_LIMIT;
  const pdfRemaining = Math.max(0, FREE_PDF_LIMIT - pdfUsed);

  const deleteMutation = useMutation({
    mutationFn: invoiceApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats'] });
      success('Invoice deleted');
    },
    onError: (err) => error('Delete failed', extractError(err)),
  });

  const duplicateMutation = useMutation({
    mutationFn: invoiceApi.duplicate,
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      success('Invoice duplicated');
      navigate(`/invoices/${inv.id}`);
    },
    onError: (err) => error('Duplicate failed', extractError(err)),
  });

  const pdfMutation = useMutation({
    mutationFn: ({ id, templateId }: { id: string; number: string; templateId?: string }) =>
      invoiceApi.downloadPdfStream(id, templateId),
    onSuccess: (blob, vars) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${vars.number || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDialogInvoice(null);
      setDownloadingTemplateId(undefined);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      success('PDF downloaded!', isPro ? undefined : `${Math.max(0, pdfRemaining - 1)} free downloads remaining`);
    },
    onError: (err) => {
      setDownloadingTemplateId(undefined);
      if (err instanceof PaymentRequiredError) {
        setDialogInvoice(null);
        error(
          'PDF limit reached',
          "You've used all 5 free PDF downloads this month.",
          { label: 'Upgrade to Pro', onClick: () => navigate('/billing') },
        );
        queryClient.invalidateQueries({ queryKey: ['billing'] });
      } else {
        error('PDF failed', extractError(err));
      }
    },
  });

  const handleDelete = (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    deleteMutation.mutate(id);
  };

  const handleDownloadClick = (inv: { id: string; number: string }) => {
    if (pdfLimitReached) {
      error(
        'PDF limit reached',
        "You've used all 5 free PDF downloads this month.",
        { label: 'Upgrade to Pro', onClick: () => navigate('/billing') },
      );
      return;
    }
    // If user has custom templates, show format choice dialog
    if (hasCustomTemplates) {
      setDialogInvoice(inv);
    } else {
      // No custom templates — download directly in generic format
      pdfMutation.mutate({ ...inv, templateId: undefined });
    }
  };

  const handleFormatSelect = (templateId?: string) => {
    if (!dialogInvoice) return;
    setDownloadingTemplateId(templateId ?? null);
    pdfMutation.mutate({ ...dialogInvoice, templateId });
  };

  const invoices = data?.invoices || [];
  const meta = data?.meta;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Invoices"
        subtitle="Manage all your NDIS invoices, quotes, and purchase orders."
        actions={
          <Button onClick={() => navigate('/invoices/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Invoice</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      {/* PDF limit banner */}
      {!isPro && billingData && (
        <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border p-3 sm:p-4 ${
          pdfLimitReached
            ? 'border-red-200 bg-red-50'
            : pdfUsed >= 3
              ? 'border-amber-200 bg-amber-50'
              : 'border-blue-200 bg-blue-50'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className={`w-4 h-4 flex-shrink-0 ${
              pdfLimitReached ? 'text-red-500' : pdfUsed >= 3 ? 'text-amber-500' : 'text-blue-500'
            }`} />
            <p className={`text-sm truncate ${
              pdfLimitReached ? 'text-red-800' : pdfUsed >= 3 ? 'text-amber-800' : 'text-blue-800'
            }`}>
              {pdfLimitReached
                ? 'PDF download limit reached — upgrade to continue.'
                : `${pdfUsed} / ${FREE_PDF_LIMIT} free PDF downloads used this month.`}
            </p>
          </div>
          <Button
            size="sm"
            className="flex-shrink-0 gap-1.5 h-7 text-xs"
            onClick={() => navigate('/billing')}
          >
            <Crown className="w-3 h-3" />
            Upgrade
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search invoice # or participant…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {meta && (
          <p className="text-xs text-muted-foreground self-center sm:ml-auto">
            {meta.total} invoice{meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-20 px-4">
              <FileText className="w-12 h-12 text-muted-foreground/25 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {search || status !== 'ALL' ? 'No invoices match your filters' : 'No invoices yet'}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {search || status !== 'ALL' ? 'Try clearing filters' : 'Create your first invoice'}
              </p>
              {!(search || status !== 'ALL') && (
                <Button size="sm" onClick={() => navigate('/invoices/new')} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Create invoice
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th className="hidden sm:table-cell">Participant</th>
                    <th className="hidden md:table-cell">Date</th>
                    <th>Amount</th>
                    <th className="hidden sm:table-cell">Status</th>
                    <th className="text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <td className="font-medium text-sm">{inv.number || 'Draft'}</td>
                      <td className="hidden sm:table-cell text-muted-foreground max-w-[160px] truncate">
                        {inv.clientName || '—'}
                      </td>
                      <td className="hidden md:table-cell text-muted-foreground text-sm">
                        {formatDate(inv.issueDate)}
                      </td>
                      <td className="font-medium">{formatMoney(inv.totalAmount, inv.currency)}</td>
                      <td className="hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(inv.status)}`}>
                          {getStatusLabel(inv.status)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit"
                            onClick={() => navigate(`/invoices/${inv.id}`)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className={`h-7 w-7 p-0 ${pdfLimitReached ? 'opacity-40' : ''}`}
                            title={pdfLimitReached ? 'PDF limit reached — upgrade to Pro' : 'Download PDF'}
                            onClick={() => handleDownloadClick({ id: inv.id, number: inv.number })}
                            disabled={pdfMutation.isPending && pdfMutation.variables?.id === inv.id}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate"
                            onClick={() => duplicateMutation.mutate(inv.id)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete" onClick={() => handleDelete(inv.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Page {meta.page} of {meta.totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}
                  onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= meta.totalPages}
                  onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Download format dialog */}
      <DownloadFormatDialog
        open={dialogInvoice !== null}
        onClose={() => { if (!pdfMutation.isPending) setDialogInvoice(null); }}
        onSelect={handleFormatSelect}
        isDownloading={pdfMutation.isPending}
        downloadingTemplateId={downloadingTemplateId}
      />
    </div>
  );
}
