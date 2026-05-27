import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Star, Trash2, Plus, Lock, AlertCircle, X,
  CheckCircle2, Clock, RefreshCw, Sparkles, ChevronDown, ChevronUp,
  Brain,
} from 'lucide-react';
import { templateApi } from '@/api/template.api';
import { paymentApi } from '@/api/payment.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { cn } from '@/lib/utils';
import { Template, TemplateAnalysisStatus, FieldMapping } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TemplateAnalysisStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Queued', color: 'text-muted-foreground', icon: <Clock className="w-3.5 h-3.5" /> },
  PROCESSING: { label: 'Analysing…', color: 'text-blue-600', icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
  READY: { label: 'Ready', color: 'text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FAILED: { label: 'Analysis failed', color: 'text-destructive', icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

function confidenceBadge(c: number) {
  if (c >= 0.9) return 'bg-emerald-100 text-emerald-700';
  if (c >= 0.7) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const { error } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: () => templateApi.upload(file!, name || undefined, description || undefined),
    onSuccess: onUploaded,
    onError: (err) => error('Upload failed', extractError(err)),
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else error('Invalid file', 'Please upload a PDF file');
  }, [error]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) setFile(picked);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="bg-background rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Upload PDF Template</h2>
              <p className="text-xs text-muted-foreground">AI will automatically detect and map all fields</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-muted-foreground/25 hover:border-brand-400 hover:bg-brand-50/40',
              file && 'border-emerald-400 bg-emerald-50',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onFileChange} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-10 h-10 text-emerald-500" />
                <p className="font-medium text-sm text-emerald-700">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                <button type="button" className="text-xs text-muted-foreground underline" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  Choose different file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">Drop your PDF here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse — max 20 MB</p>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Works with: NDIS forms, vendor invoices, insurance claims, government forms, and any PDF
                </p>
              </div>
            )}
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={file ? file.name.replace(/\.pdf$/i, '') : 'e.g. NDIS Payment Request'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
            </div>
          </div>

          {/* What AI will do */}
          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What happens next</p>
            {[
              'AI reads every label, field, and table in your PDF',
              'Intelligently maps fields to invoice data (vendor, client, totals, line items…)',
              'Auto-fills future invoices in your original PDF layout — no HTML, no coding',
            ].map((step) => (
              <div key={step} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            disabled={!file || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            className="gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {uploadMutation.isPending ? 'Uploading…' : 'Upload & Analyse'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Field mapping viewer ─────────────────────────────────────────────────────

function FieldMappingList({ mappings, templateId }: { mappings: FieldMapping[]; templateId: string }) {
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const correctMutation = useMutation({
    mutationFn: ({ label, mappedTo }: { label: string; mappedTo: string }) =>
      templateApi.correctMapping(templateId, label, mappedTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      success('Mapping updated');
      setEditing(null);
    },
    onError: (err) => error('Update failed', extractError(err)),
  });

  const visible = expanded ? mappings : mappings.slice(0, 4);

  return (
    <div className="mt-3 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {mappings.length} fields detected
      </p>
      {visible.map((m) => (
        <div key={m.label} className="flex items-center gap-2 text-xs">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', confidenceBadge(m.confidence).includes('emerald') ? 'bg-emerald-400' : confidenceBadge(m.confidence).includes('amber') ? 'bg-amber-400' : 'bg-red-400')} />
          <span className="text-muted-foreground truncate max-w-[110px]" title={m.label}>{m.label}</span>
          <span className="text-muted-foreground">→</span>
          {editing === m.label ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                className="h-5 text-xs px-1 py-0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
              />
              <button type="button" className="text-brand-600 text-xs font-medium" onClick={() => correctMutation.mutate({ label: m.label, mappedTo: editValue })}>Save</button>
              <button type="button" className="text-muted-foreground text-xs" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              className="font-mono text-xs text-brand-700 hover:underline truncate"
              title="Click to correct"
              onClick={() => { setEditing(m.label); setEditValue(m.mappedTo); }}
            >
              {m.mappedTo}
            </button>
          )}
          <span className={cn('ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0', confidenceBadge(m.confidence))}>
            {Math.round(m.confidence * 100)}%
          </span>
        </div>
      ))}
      {mappings.length > 4 && (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> {mappings.length - 4} more fields</>}
        </button>
      )}
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({ tmpl, onDelete, onReanalyze }: {
  tmpl: Template;
  onDelete: () => void;
  onReanalyze?: () => void;
}) {
  const status = STATUS_CONFIG[tmpl.analysisStatus] ?? STATUS_CONFIG.PENDING;
  const isSystem = tmpl.scope === 'SYSTEM';
  const mappings: FieldMapping[] = (tmpl as Template & { fieldMappings?: FieldMapping[] }).fieldMappings ?? [];

  return (
    <Card className="group hover:shadow-card-hover transition-all duration-200 overflow-hidden">
      {/* Preview area */}
      <div
        className="h-28 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${tmpl.brandColor}18, ${tmpl.brandColor}08)` }}
      >
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center"
            style={{ background: tmpl.brandColor }}
          >
            {tmpl.analysisStatus === 'READY' ? (
              <Brain className="w-5 h-5 text-white" />
            ) : (
              <FileText className="w-5 h-5 text-white" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {tmpl.pageCount > 1 ? `${tmpl.pageCount} pages` : 'PDF Template'}
          </p>
        </div>

        {tmpl.isDefault && (
          <div className="absolute top-2 right-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
              <Star className="w-2.5 h-2.5" /> Default
            </span>
          </div>
        )}

        {/* Analysis status pill */}
        <div className="absolute bottom-2 left-2">
          <span className={cn('flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm border', status.color)}>
            {status.icon}
            {status.label}
          </span>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{tmpl.name}</p>
            {tmpl.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{tmpl.description}</p>
            )}
          </div>
          {!isSystem && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {(tmpl.analysisStatus === 'FAILED' || tmpl.analysisStatus === 'READY') && onReanalyze && (
                <button
                  type="button"
                  onClick={onReanalyze}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title={tmpl.analysisStatus === 'FAILED' ? 'Retry analysis' : 'Re-analyze template'}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Badge variant={isSystem ? 'secondary' : 'outline'} className="text-[10px] py-0">
            {isSystem ? 'System' : 'Custom'}
          </Badge>
          {tmpl.analysisStatus === 'READY' && mappings.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{mappings.length} fields</span>
          )}
        </div>

        {/* Show field mappings when ready */}
        {tmpl.analysisStatus === 'READY' && mappings.length > 0 && (
          <FieldMappingList mappings={mappings} templateId={tmpl.id} />
        )}

        {tmpl.analysisStatus === 'PROCESSING' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-600">
            <RefreshCw className="w-3 h-3 animate-spin" />
            AI is reading your PDF and mapping fields…
          </div>
        )}

        {tmpl.analysisStatus === 'FAILED' && (
          <p className="mt-3 text-xs text-destructive">
            Analysis failed. Click retry to try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    // Poll every 4s while any template is processing
    refetchInterval: (query) => {
      const data = query.state.data as Template[] | undefined;
      return data?.some((t) => t.analysisStatus === 'PROCESSING' || t.analysisStatus === 'PENDING') ? 4000 : false;
    },
  });

  const { data: billingData } = useQuery({
    queryKey: ['billing'],
    queryFn: paymentApi.getSubscription,
  });

  const deleteMutation = useMutation({
    mutationFn: templateApi.delete,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['templates'] });
      const prev = queryClient.getQueryData<Template[]>(['templates']);
      queryClient.setQueryData<Template[]>(['templates'], (old) => old?.filter((t) => t.id !== id) ?? []);
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['templates'], ctx.prev);
      error('Delete failed', extractError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      success('Template deleted');
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: templateApi.reanalyze,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      success('Re-analysis started');
    },
    onError: (err) => error('Failed to retry', extractError(err)),
  });

  const systemTemplates = templates.filter((t) => t.scope === 'SYSTEM');
  const userTemplates = templates.filter((t) => t.scope === 'USER');

  const isPro = billingData?.subscription?.plan !== 'FREE' && billingData?.subscription?.plan;
  const isFreeWithLimit = !isPro && userTemplates.length >= 1;

  const handleUploaded = () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    success('Template uploaded — AI analysis running…');
    setShowUpload(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <AnimatePresence>
        {showUpload && <UploadDialog onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete template?"
        description="This will permanently remove the template and its field mappings. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate(deleteTarget!)}
        onClose={() => setDeleteTarget(null)}
      />

      <PageHeader
        title="PDF Templates"
        subtitle="Upload any invoice or payment form — AI automatically reads, maps, and fills it for you."
        actions={
          <Button
            className="gap-2"
            size="sm"
            onClick={() => setShowUpload(true)}
            disabled={isFreeWithLimit}
          >
            <Plus className="w-4 h-4" />
            Upload PDF
          </Button>
        }
      />

      {/* How it works banner */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-xl border border-brand-200 bg-brand-50 p-4 flex items-start gap-4"
      >
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-brand-900">How AI templates work</p>
          <p className="text-xs text-brand-700 mt-1">
            Upload any PDF — NDIS forms, vendor invoices, insurance claims, government forms. The AI reads every label and field,
            understands the layout, and automatically fills in your invoice data when you generate. No HTML, no coding, no coordinate mapping.
          </p>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* System templates */}
          {systemTemplates.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Built-in Templates</h2>
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">— always available</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {systemTemplates.map((tmpl, i) => (
                  <motion.div key={tmpl.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <TemplateCard tmpl={tmpl} onDelete={() => {}} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* User templates */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your PDF Templates</h2>
              {!isPro && (
                <span className="text-xs text-muted-foreground">— {userTemplates.length} of 1 (Free)</span>
              )}
            </div>

            {userTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No custom templates yet</p>
                  <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
                    Upload any PDF form and let AI automatically detect and map all fields — no setup required.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowUpload(true)}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Your First PDF
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userTemplates.map((tmpl, i) => (
                    <motion.div key={tmpl.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                      <TemplateCard
                        tmpl={tmpl}
                        onDelete={() => setDeleteTarget(tmpl.id)}
                        onReanalyze={() => reanalyzeMutation.mutate(tmpl.id)}
                      />
                    </motion.div>
                  ))}
                </div>

                {isFreeWithLimit && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Template limit reached</p>
                      <p className="text-xs text-amber-800 mt-1">Upgrade to Pro for unlimited PDF templates.</p>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
