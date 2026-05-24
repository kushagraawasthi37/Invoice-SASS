import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  Plus, Trash2, Download, Mail, Copy, ChevronDown, ArrowLeft, Save, LayoutTemplate, X,
} from 'lucide-react';
import { invoiceApi, PaymentRequiredError } from '@/api/invoice.api';
import { templateApi } from '@/api/template.api';
import { settingsApi } from '@/api/settings.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { calcHours, formatMoney, formatPhone, formatDateInput } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ComplianceChecklist } from '@/components/invoice/ComplianceChecklist';
import { SignaturePad } from '@/components/invoice/SignaturePad';
import { PageHeader } from '@/components/common/PageHeader';
import { CURRENCIES, INVOICE_STATUSES, DOCUMENT_TYPES } from '@/lib/constants';
import { InvoiceLineItem, Template } from '@/types';

// ─── Template picker dialog ────────────────────────────────────
function TemplatePicker({
  templates,
  onSelect,
  onClose,
}: {
  templates: Template[];
  onSelect: (templateId: string | undefined) => void;
  onClose: () => void;
}) {
  const systemTemplates = templates.filter((t) => t.scope === 'SYSTEM');
  const userTemplates = templates.filter((t) => t.scope === 'USER');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-base">Choose a Template</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {systemTemplates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">System Templates</p>
              <div className="space-y-2">
                {systemTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.brandColor }}>
                      <LayoutTemplate className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">System</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {userTemplates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Your Templates</p>
              <div className="space-y-2">
                {userTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-brand-400 hover:bg-brand-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.brandColor }}>
                      <LayoutTemplate className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 flex-shrink-0">Custom</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Zod schema ────────────────────────────────────────────────
const lineItemSchema = z.object({
  serviceDate: z.string().optional().default(''),
  startTime: z.string().optional().default(''),
  endTime: z.string().optional().default(''),
  description: z.string().default(''),
  hours: z.coerce.number().min(0).default(0),
  rate: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0).default(0),
});

const schema = z.object({
  type: z.enum(['INVOICE', 'QUOTE', 'PURCHASE_ORDER']).default('INVOICE'),
  number: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE']).default('DRAFT'),
  issueDate: z.string().min(1, 'Required'),
  dueDate: z.string().optional(),
  serviceMonth: z.string().optional(),
  providerName: z.string().min(1, 'Provider name is required'),
  providerTitle: z.string().optional().default(''),
  providerAddress: z.string().optional().default(''),
  providerEmail: z.string().optional().default(''),
  providerPhone: z.string().optional().default(''),
  providerABN: z.string().optional().default(''),
  clientName: z.string().min(1, 'Participant name is required'),
  clientAddress: z.string().optional().default(''),
  clientEmail: z.string().optional().default(''),
  ndisNumber: z.string().optional().default(''),
  fiscalAgent: z.string().optional().default(''),
  supportCoordinator: z.string().optional().default(''),
  legalGuardian: z.string().optional().default(''),
  bsbAccount: z.string().optional().default(''),
  currency: z.string().default('AUD'),
  notes: z.string().optional().default(''),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one service line'),
  clientSigData: z.string().optional().default(''),
  providerSigData: z.string().optional().default(''),
});

type FormData = z.infer<typeof schema>;

// ─── Totals helpers ────────────────────────────────────────────
function computeTotals(lineItems: FormData['lineItems']) {
  let totalHours = 0;
  let totalAmount = 0;
  return lineItems.map((li) => {
    const h = li.serviceDate && li.startTime && li.endTime
      ? calcHours(li.startTime, li.endTime)
      : li.hours;
    const amt = h * (li.rate || 0);
    totalHours += h;
    totalAmount += amt;
    return { ...li, hours: h, amount: amt };
  }).reduce((acc) => acc, { totalHours, totalAmount } as { totalHours: number; totalAmount: number });
}

export function InvoiceEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = (searchParams.get('type') as FormData['type']) || 'INVOICE';
  const queryClient = useQueryClient();
  const { success, error, info } = useToast();
  const [totals, setTotals] = useState({ totalHours: 0, totalAmount: 0 });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['workspace-settings'],
    queryFn: settingsApi.getWorkspace,
  });

  const { data: existingInvoice, isLoading: invoiceLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.getById(id!),
    enabled: isEdit,
  });

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
  });
  const userTemplates = allTemplates.filter((t) => t.scope === 'USER');

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: initialType,
      status: 'DRAFT',
      issueDate: new Date().toISOString().split('T')[0],
      serviceMonth: new Date().toISOString().slice(0, 7),
      currency: 'AUD',
      lineItems: [{ serviceDate: '', startTime: '', endTime: '', description: settings?.defaultDescription || 'Support Services', hours: 0, rate: Number(settings?.defaultRate || 50), amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lineItems' });
  const watchedLineItems = form.watch('lineItems');
  const watchedStatus = form.watch('status');
  const isPaid = watchedStatus === 'PAID';

  // Recalculate totals on line items change
  useEffect(() => {
    let h = 0, a = 0;
    watchedLineItems?.forEach((li) => {
      // serviceDate is for record-keeping only — hours come from start/end times or manual entry
      const hours = li.startTime && li.endTime
        ? calcHours(li.startTime, li.endTime)
        : (li.hours || 0);
      h += hours;
      a += hours * (li.rate || 0);
    });
    setTotals({ totalHours: h, totalAmount: a });
  }, [watchedLineItems]);

  // Populate form from existing invoice
  useEffect(() => {
    if (existingInvoice) {
      form.reset({
        type: existingInvoice.type as FormData['type'],
        number: existingInvoice.number,
        status: existingInvoice.status as FormData['status'],
        issueDate: formatDateInput(existingInvoice.issueDate),
        dueDate: existingInvoice.dueDate ? formatDateInput(existingInvoice.dueDate) : '',
        serviceMonth: existingInvoice.serviceMonth || '',
        providerName: existingInvoice.providerName,
        providerTitle: existingInvoice.providerTitle,
        providerAddress: existingInvoice.providerAddress,
        providerEmail: existingInvoice.providerEmail,
        providerPhone: existingInvoice.providerPhone,
        providerABN: existingInvoice.providerABN,
        clientName: existingInvoice.clientName,
        clientAddress: existingInvoice.clientAddress,
        clientEmail: existingInvoice.clientEmail,
        ndisNumber: existingInvoice.ndisNumber,
        fiscalAgent: existingInvoice.fiscalAgent,
        supportCoordinator: existingInvoice.supportCoordinator,
        legalGuardian: existingInvoice.legalGuardian,
        bsbAccount: existingInvoice.bsbAccount,
        currency: existingInvoice.currency,
        notes: existingInvoice.notes,
        lineItems: existingInvoice.lineItems.map((li) => ({
          serviceDate: li.serviceDate ? formatDateInput(li.serviceDate) : '',
          startTime: li.startTime,
          endTime: li.endTime,
          description: li.description,
          hours: Number(li.hours),
          rate: Number(li.rate),
          amount: Number(li.amount),
        })),
        clientSigData: existingInvoice.clientSigUrl || '',
        providerSigData: existingInvoice.providerSigUrl || '',
      });
    } else if (!isEdit && settings) {
      form.setValue('providerName', settings.bizName || '');
      form.setValue('providerAddress', settings.address || '');
      form.setValue('providerEmail', settings.email || '');
      form.setValue('providerPhone', settings.phone || '');
      form.setValue('providerTitle', settings.defaultProviderTitle || '');
      form.setValue('currency', settings.currency || 'AUD');
    }
  }, [existingInvoice, settings, isEdit]);

  // Compliance checks
  const providerName = form.watch('providerName');
  const providerABN = form.watch('providerABN');
  const clientName = form.watch('clientName');
  const ndisNumber = form.watch('ndisNumber');
  const providerSigData = form.watch('providerSigData');

  const complianceItems = [
    { id: 'provider', label: 'Provider Name & ABN', complete: !!(providerName && providerABN) },
    { id: 'client', label: 'Participant Name & NDIS Number', complete: !!(clientName && ndisNumber) },
    { id: 'services', label: 'Service Details', complete: fields.length > 0 },
    { id: 'rates', label: 'Hourly Rate & Total Amount', complete: totals.totalAmount > 0 },
    { id: 'signatures', label: 'Provider Signature', complete: !!providerSigData },
  ];

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const lineItems = (data.lineItems || []).map((li) => {
        // Use time-based calculation when both times are set; fall back to manual hours
        const hours = li.startTime && li.endTime
          ? calcHours(li.startTime, li.endTime)
          : (li.hours || 0);
        return { ...li, hours, amount: hours * (li.rate || 0) };
      });
      const totalHours = lineItems.reduce((s, li) => s + li.hours, 0);
      const totalAmount = lineItems.reduce((s, li) => s + li.amount, 0);
      const payload = {
        ...data,
        totalHours,
        subtotal: totalAmount,
        totalAmount,
        lineItems,
      };
      if (isEdit) return invoiceApi.update(id!, payload);
      return invoiceApi.create(payload);
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-stats'] });
      success(isEdit ? 'Invoice updated!' : 'Invoice created!');
      if (!isEdit) navigate(`/invoices/${inv.id}`);
    },
    onError: (err) => error('Save failed', extractError(err)),
  });

  const pdfMutation = useMutation({
    mutationFn: async (templateId?: string) => {
      if (!isEdit) throw new Error('Save invoice first');
      return invoiceApi.downloadPdfStream(id!, templateId);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${form.getValues('number') || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      success('PDF downloaded!');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      if (err instanceof PaymentRequiredError) {
        error(
          'PDF limit reached',
          "You've used all 5 free PDF downloads.",
          { label: 'Upgrade to Pro', onClick: () => navigate('/billing') },
        );
      } else {
        error('PDF failed', extractError(err));
      }
    },
  });

  const handleDownloadPdf = () => {
    if (!isEdit) return;
    if (userTemplates.length > 0) {
      setShowTemplatePicker(true);
    } else {
      pdfMutation.mutate(undefined);
    }
  };

  const openEmailDraft = () => {
    const clientEmail = form.getValues('clientEmail');
    const clientNameVal = form.getValues('clientName') || 'Client';
    const invNumber = form.getValues('number') || 'invoice';
    const provName = form.getValues('providerName') || 'Provider';
    const month = form.getValues('serviceMonth');
    const monthText = month ? ` for ${new Date(month + '-01').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` : '';
    const subject = encodeURIComponent(`Invoice ${invNumber}${monthText}`);
    const body = encodeURIComponent(`Hello ${clientNameVal},\n\nPlease find attached invoice ${invNumber}${monthText}.\n\nKindly review, sign, and return it.\n\nThank you,\n${provName}`);
    if (!clientEmail) { info('Add a client email first'); return; }
    window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}`;
  };

  const copyEmailMessage = () => {
    const clientEmail = form.getValues('clientEmail');
    const clientNameVal = form.getValues('clientName') || 'Client';
    const invNumber = form.getValues('number') || 'invoice';
    const provName = form.getValues('providerName') || 'Provider';
    const text = `To: ${clientEmail}\nSubject: Invoice ${invNumber}\n\nHello ${clientNameVal},\n\nPlease find attached invoice ${invNumber}.\n\nThank you,\n${provName}`;
    navigator.clipboard?.writeText(text).then(() => success('Copied to clipboard!'));
  };

  const onSubmit = (data: FormData) => saveMutation.mutate(data);

  if (isEdit && invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto pb-20">
      {showTemplatePicker && (
        <TemplatePicker
          templates={allTemplates}
          onClose={() => setShowTemplatePicker(false)}
          onSelect={(templateId) => {
            setShowTemplatePicker(false);
            pdfMutation.mutate(templateId);
          }}
        />
      )}
      <PageHeader
        title={isEdit ? 'Edit Invoice' : 'New Invoice'}
        subtitle="Fill in the details below — totals calculate automatically."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/invoices')} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Button>
        }
      />

      {isPaid && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
          <p className="text-sm text-brand-700 font-medium">
            This invoice is marked as Paid. Editing is locked. You can still change the status or download the PDF.
          </p>
        </div>
      )}

      <ComplianceChecklist items={complianceItems} />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* ── Invoice Info ──────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Invoice Info</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Document Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVOICE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice #</Label>
              <Input {...form.register('number')} placeholder="Auto-generated" disabled={isPaid} />
              <p className="text-xs text-muted-foreground">Edit to override; next invoice continues from here.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Date *</Label>
              <Input type="date" {...form.register('issueDate')} disabled={isPaid} />
              {form.formState.errors.issueDate && <p className="text-xs text-destructive">{form.formState.errors.issueDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...form.register('dueDate')} disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Service Month</Label>
              <Input type="month" {...form.register('serviceMonth')} disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value} disabled={isPaid}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Provider Info ─────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{settings?.providerLabel || 'Provider'} / Support Worker Info</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-fills from Settings.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Provider Name *</Label>
              <Input {...form.register('providerName')} placeholder="Jane Smith" disabled={isPaid}
                error={!!form.formState.errors.providerName} />
              {form.formState.errors.providerName && <p className="text-xs text-destructive">{form.formState.errors.providerName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Title / Role</Label>
              <Input {...form.register('providerTitle')} placeholder="Support Worker" disabled={isPaid} />
            </div>
            <div className="col-span-1 sm:col-span-2 space-y-1.5">
              <Label>Provider Address</Label>
              <Input {...form.register('providerAddress')} placeholder="123 Any Street, Sydney NSW 2000" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Provider Email</Label>
              <Input type="email" {...form.register('providerEmail')} placeholder="provider@email.com.au" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Provider Phone</Label>
              <Input {...form.register('providerPhone')} placeholder="04XX XXX XXX" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Provider ABN *</Label>
              <Input {...form.register('providerABN')} placeholder="12 345 678 901" disabled={isPaid} />
              <p className="text-xs text-muted-foreground">Required for NDIS compliance</p>\n            </div>
          </CardContent>
        </Card>

        {/* ── Participant Info ──────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>{settings?.clientLabel || 'NDIS Participant'} Info</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Participant Name *</Label>
              <Input {...form.register('clientName')} placeholder="Participant Full Name" disabled={isPaid}
                error={!!form.formState.errors.clientName} />
              {form.formState.errors.clientName && <p className="text-xs text-destructive">{form.formState.errors.clientName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>NDIS Participant Number *</Label>
              <Input {...form.register('ndisNumber')} placeholder="430001234" maxLength={9} disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Plan Manager</Label>
              <Input {...form.register('fiscalAgent')} placeholder="Plan Manager Name" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Support Coordinator</Label>
              <Input {...form.register('supportCoordinator')} placeholder="Coordinator Name" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>BSB / Account Number</Label>
              <Input {...form.register('bsbAccount')} placeholder="123-456 / 12345678" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Legal Guardian / Nominee</Label>
              <Input {...form.register('legalGuardian')} placeholder="Guardian Name" disabled={isPaid} />
            </div>
            <div className="col-span-1 sm:col-span-2 space-y-1.5">
              <Label>Participant Address</Label>
              <Input {...form.register('clientAddress')} placeholder="456 Street, Sydney NSW 2000" disabled={isPaid} />
            </div>
            <div className="space-y-1.5">
              <Label>Participant Email</Label>
              <Input type="email" {...form.register('clientEmail')} placeholder="participant@email.com" disabled={isPaid} />
            </div>
          </CardContent>
        </Card>

        {/* ── Services ─────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Services Rendered</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Time billed in 15-minute increments. Minutes round <strong>down</strong> to 00, 15, 30, or 45 (NDIS requirement). End time before start time = <strong>next day</strong>.
            </p>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Date', 'Start', 'End', 'Description', 'Hrs', 'Rate', 'Amount', ''].map((h) => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => {
                    const li = watchedLineItems?.[idx] || {};
                    // Hours come from start/end times when both are set; otherwise use manual entry
                    const hasTime = !!li.startTime && !!li.endTime;
                    const hrs = hasTime
                      ? calcHours(li.startTime, li.endTime)
                      : (li.hours || 0);
                    const amt = hrs * (li.rate || 0);
                    return (
                      <tr key={field.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                        <td className="py-1.5 px-1">
                          <Input type="date" {...form.register(`lineItems.${idx}.serviceDate`)}
                            className="h-8 text-xs w-32" disabled={isPaid} />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input type="time" {...form.register(`lineItems.${idx}.startTime`)}
                            className="h-8 text-xs w-24" disabled={isPaid} />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input type="time" {...form.register(`lineItems.${idx}.endTime`)}
                            className="h-8 text-xs w-24" disabled={isPaid} />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input {...form.register(`lineItems.${idx}.description`)}
                            placeholder="Personal care support" className="h-8 text-xs" disabled={isPaid} />
                        </td>
                        <td className="py-1.5 px-1">
                          {hasTime ? (
                            <Input type="number" value={hrs.toFixed(2)} readOnly
                              className="h-8 text-xs w-16 bg-muted cursor-not-allowed" />
                          ) : (
                            <Input type="number" step="0.25" min="0"
                              {...form.register(`lineItems.${idx}.hours`, { valueAsNumber: true })}
                              className="h-8 text-xs w-16" disabled={isPaid} placeholder="0" />
                          )}
                        </td>
                        <td className="py-1.5 px-1">
                          <Input type="number" step="0.01" {...form.register(`lineItems.${idx}.rate`, { valueAsNumber: true })}
                            className="h-8 text-xs w-20" disabled={isPaid} />
                        </td>
                        <td className="py-1.5 px-1">
                          <Input value={formatMoney(amt, form.watch('currency'))} readOnly
                            className="h-8 text-xs w-24 bg-muted cursor-not-allowed" />
                        </td>
                        <td className="py-1.5 px-1">
                          {!isPaid && (
                            <button type="button" onClick={() => remove(idx)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isPaid && (
              <button
                type="button"
                onClick={() => append({ serviceDate: '', startTime: '', endTime: '', description: settings?.defaultDescription || '', hours: 0, rate: Number(settings?.defaultRate || 50), amount: 0 })}
                className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-brand-300 rounded-lg py-2.5 text-xs text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Service Line
              </button>
            )}

            <div className="flex justify-end mt-5">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Total Hours</span>
                  <span>{totals.totalHours.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>GST Status</span>
                  <span>GST Free — NDIS Support</span>
                </div>
                <div className="flex justify-between text-base font-semibold border-t pt-2 mt-2">
                  <span>Total Amount (AUD)</span>
                  <span>{formatMoney(totals.totalAmount, form.watch('currency'))}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Notes ────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <textarea
              {...form.register('notes')}
              rows={3}
              disabled={isPaid}
              placeholder="Optional notes for the client…"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </CardContent>
        </Card>

        {/* ── Signatures ───────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Signatures & Delivery</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div>
              <Controller
                control={form.control}
                name="clientSigData"
                render={({ field }) => (
                  <SignaturePad
                    label="Participant Signature"
                    value={field.value || ''}
                    onChange={field.onChange}
                    readOnly={isPaid}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Or leave blank — the participant signs their copy and returns it.
              </p>
            </div>
            <Controller
              control={form.control}
              name="providerSigData"
              render={({ field }) => (
                <SignaturePad
                  label="Provider Signature"
                  value={field.value || ''}
                  onChange={field.onChange}
                  readOnly={isPaid}
                />
              )}
            />
          </CardContent>
        </Card>

        {/* ── Email handoff ─────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Email Invoice</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Download the PDF, then open your email app with the draft pre-filled.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={handleDownloadPdf}
                disabled={!isEdit || pdfMutation.isPending} loading={pdfMutation.isPending}>
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={openEmailDraft}>
                <Mail className="w-4 h-4" />
                Open Email App
              </Button>
              <Button type="button" variant="ghost" className="gap-2" onClick={copyEmailMessage}>
                <Copy className="w-4 h-4" />
                Copy Message
              </Button>
            </div>
            {!isEdit && (
              <p className="text-xs text-muted-foreground mt-2">Save invoice first to enable PDF download.</p>
            )}
          </CardContent>
        </Card>

        {/* ── Form actions ─────────────────────────────── */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => navigate('/invoices')}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { form.setValue('status', 'DRAFT'); form.handleSubmit(onSubmit)(); }}
            loading={saveMutation.isPending}
          >
            Save as Draft
          </Button>
          <Button type="submit" loading={saveMutation.isPending} className="gap-2">
            <Save className="w-4 h-4" />
            {isEdit ? 'Update Invoice' : 'Save Invoice'}
          </Button>
        </div>
      </form>
    </div>
  );
}
