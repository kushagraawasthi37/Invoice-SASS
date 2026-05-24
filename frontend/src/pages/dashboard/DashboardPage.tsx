import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FileText, TrendingUp, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, Download, Zap,
} from 'lucide-react';
import { invoiceApi } from '@/api/invoice.api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { formatMoney, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { FREE_PDF_LIMIT } from '@/lib/constants';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const FREE_LIMIT = 5;

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'text-brand-500',
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <Card className="h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <p className="font-serif text-3xl text-foreground">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { data: stats } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: invoiceApi.getStats,
  });

  const { data: recentData } = useQuery({
    queryKey: ['invoices', { limit: 6 }],
    queryFn: () => invoiceApi.list({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
  });

  const recentInvoices = recentData?.invoices || [];
  const pdfUsed = stats?.usage?.pdfDownloads || 0;
  const isPro = false; // derive from subscription later
  const pdfPercent = Math.min(100, (pdfUsed / FREE_LIMIT) * 100);

  const chartData = [
    { month: 'Jan', revenue: 0 },
    { month: 'Feb', revenue: 0 },
    { month: 'Mar', revenue: 0 },
    { month: 'Apr', revenue: 0 },
    { month: 'May', revenue: 0 },
    { month: 'Jun', revenue: Number(stats?.thisMonthRevenue || 0) },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Good morning, ${user?.name?.split(' ')[0]} 👋`}
        subtitle="Here's what's happening with your invoices."
        actions={
          <Button onClick={() => navigate('/invoices/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            New Invoice
          </Button>
        }
      />

      {/* Free plan usage banner */}
      {!isPro && pdfUsed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                {pdfUsed >= FREE_LIMIT
                  ? 'PDF limit reached — upgrade to download more'
                  : `${FREE_LIMIT - pdfUsed} free PDF download${FREE_LIMIT - pdfUsed !== 1 ? 's' : ''} remaining`}
              </p>
              <div className="mt-1.5 h-1.5 w-48 rounded-full bg-amber-200">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pdfPercent}%` }} />
              </div>
            </div>
          </div>
          <Button size="sm" variant="brand" onClick={() => navigate('/billing')} className="flex-shrink-0">
            Upgrade to Pro
          </Button>
        </motion.div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText} label="Total Invoices" value={stats?.total || 0} subtext="All time" delay={0} />
        <StatCard icon={Clock} label="Draft" value={stats?.draft || 0} subtext="Awaiting send" color="text-gray-500" delay={0.05} />
        <StatCard icon={TrendingUp} label="Sent" value={stats?.sent || 0} subtext="Awaiting payment" color="text-blue-500" delay={0.1} />
        <StatCard
          icon={CheckCircle2}
          label="This Month"
          value={formatMoney(stats?.thisMonthRevenue || 0)}
          subtext="Revenue (paid)"
          color="text-emerald-500"
          delay={0.15}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <CardTitle>Revenue Overview</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2c5f2e" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#2c5f2e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '10px',
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#2c5f2e" strokeWidth={2} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { label: 'Paid', count: stats?.paid || 0, color: 'bg-emerald-500' },
                { label: 'Sent', count: stats?.sent || 0, color: 'bg-blue-500' },
                { label: 'Draft', count: stats?.draft || 0, color: 'bg-gray-300' },
                { label: 'Overdue', count: stats?.overdue || 0, color: 'bg-red-500' },
              ].map((item) => {
                const pct = stats?.total ? Math.round((item.count / stats.total) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent invoices */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Recent Invoices</CardTitle>
            <Link to="/invoices" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {recentInvoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground mb-1">No invoices yet</p>
                <p className="text-xs text-muted-foreground mb-4">Create your first invoice to get started</p>
                <Button size="sm" onClick={() => navigate('/invoices/new')} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Create invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Participant</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="font-medium text-sm">{inv.number || 'Draft'}</td>
                        <td className="text-muted-foreground">{inv.clientName || '—'}</td>
                        <td className="text-muted-foreground">{formatDate(inv.issueDate)}</td>
                        <td className="font-medium">{formatMoney(inv.totalAmount, inv.currency)}</td>
                        <td>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(inv.status)}`}>
                            {getStatusLabel(inv.status)}
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => navigate(`/invoices/${inv.id}`)}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
