import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus, Search, Download, Edit, Copy, Trash2, ShoppingCart, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { invoiceApi } from '@/api/invoice.api';
import { useToast } from '@/store/ui.store';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatMoney, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Approved' },
  { value: 'VOID', label: 'Rejected' },
];

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { search, status, page }],
    queryFn: () => invoiceApi.list({
      search: search || undefined,
      status: status !== 'ALL' ? status : undefined,
      page,
      limit: 20,
    }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: invoiceApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      success('Purchase order deleted');
    },
    onError: (err) => error('Delete failed', extractError(err)),
  });

  const duplicateMutation = useMutation({
    mutationFn: invoiceApi.duplicate,
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      success('Purchase order duplicated');
      navigate(`/invoices/${inv.id}`);
    },
    onError: (err) => error('Duplicate failed', extractError(err)),
  });

  const pdfMutation = useMutation({
    mutationFn: (id: string) => invoiceApi.downloadPdfStream(id),
    onSuccess: (blob, id) => {
      const inv = data?.invoices.find((i) => i.id === id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO-${inv?.number || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      success('PDF downloaded!');
    },
    onError: (err) => error('PDF failed', extractError(err)),
  });

  const handleDelete = (id: string) => setDeleteTarget(id);

  const orders = (data?.invoices || []).filter((inv) => inv.type === 'PURCHASE_ORDER');
  const meta = data?.meta;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete purchase order?"
        description="This cannot be undone. The purchase order will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => deleteMutation.mutate(deleteTarget!)}
        onClose={() => setDeleteTarget(null)}
      />

      <PageHeader
        title="Purchase Orders"
        subtitle="Manage NDIS purchase orders and service agreements."
        actions={
          <Button onClick={() => navigate('/invoices/new?type=PURCHASE_ORDER')} className="gap-2">
            <Plus className="w-4 h-4" />
            New Purchase Order
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search PO # or participant…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {meta && (
          <p className="text-xs text-muted-foreground self-center ml-auto">
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20">
              <ShoppingCart className="w-12 h-12 text-muted-foreground/25 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {search || status !== 'ALL' ? 'No purchase orders match your filters' : 'No purchase orders yet'}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {search || status !== 'ALL' ? 'Try clearing filters' : 'Create your first purchase order'}
              </p>
              {!(search || status !== 'ALL') && (
                <Button size="sm" onClick={() => navigate('/invoices/new?type=PURCHASE_ORDER')} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Create purchase order
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Participant</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th className="text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((inv, i) => (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <td className="font-medium text-sm">{inv.number || 'Draft'}</td>
                      <td className="text-muted-foreground max-w-[160px] truncate">{inv.clientName || '—'}</td>
                      <td className="text-muted-foreground text-sm">{formatDate(inv.issueDate)}</td>
                      <td className="font-medium">{formatMoney(inv.totalAmount, inv.currency)}</td>
                      <td>
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
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Download PDF"
                            onClick={() => pdfMutation.mutate(inv.id)}
                            disabled={pdfMutation.isPending && pdfMutation.variables === inv.id}>
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Duplicate"
                            onClick={() => duplicateMutation.mutate(inv.id)}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete"
                            onClick={() => handleDelete(inv.id)}>
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
    </div>
  );
}
