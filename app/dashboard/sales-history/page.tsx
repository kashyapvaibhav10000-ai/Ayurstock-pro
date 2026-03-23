'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TrendingUp, TrendingDown, ShoppingCart, RotateCcw, IndianRupee } from 'lucide-react';

type DatePreset = 'today' | 'week' | 'month' | 'custom';

interface Summary {
  totalSalesRevenue: number;
  totalPurchaseCost: number;
  totalReturnsAmount: number;
  grossProfit: number;
  salesCount: number;
  purchasesCount: number;
  returnsCount: number;
}

interface SaleRow {
  id: string;
  invoiceNumber: string;
  date: string;
  customer: string;
  itemCount: number;
  total: number;
  discount: number;
  paymentMode: string;
  saleType: string;
}

interface PurchaseRow {
  id: string;
  invoiceNumber: string;
  date: string;
  supplier: string;
  itemCount: number;
  total: number;
  paymentType: string;
  status: string;
}

interface ReturnRow {
  id: string;
  date: string;
  type: string;
  medicine: string;
  quantity: number;
  amount: number;
  reason: string;
}

interface HistoryData {
  summary: Summary;
  sales: SaleRow[];
  purchases: PurchaseRow[];
  returns: ReturnRow[];
}

function fmt(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDateRange(preset: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'today') {
    const s = toISO(today);
    return { startDate: s, endDate: s };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { startDate: toISO(start), endDate: toISO(today) };
  }
  // month
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  return { startDate: toISO(start), endDate: toISO(today) };
}

export default function SalesHistoryPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'returns'>('sales');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    if (!isAuthorized) router.replace('/dashboard');
  }, [isAuthorized, router]);

  const load = async () => {
    const range = preset === 'custom'
      ? { startDate: customStart, endDate: customEnd }
      : getDateRange(preset);

    if (!range.startDate || !range.endDate) return;

    try {
      setLoading(true);
      const res = await axios.get('/api/sales-history', { params: range });
      if (res.data.success) setData(res.data.data);
    } catch (e) {
      console.error('Failed to load sales history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && preset !== 'custom') load();
  }, [isAuthorized, preset]);

  if (!isAuthorized) return null;

  const s = data?.summary;
  const isProfit = (s?.grossProfit ?? 0) >= 0;

  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Last 7 Days' },
    { key: 'month', label: 'Last 30 Days' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">Sales History</h1>
          <p className="mt-1 text-sm text-text-secondary">Track revenue, purchases, returns, and overall profit.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              className="rounded-xl font-bold shadow-sm transition-all hover:shadow-bento"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-10 rounded-xl border border-surface-border bg-surface-muted px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
              <span className="text-text-muted text-sm font-bold">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-10 rounded-xl border border-surface-border bg-surface-muted px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
              <Button size="sm" className="rounded-xl shadow-soft" onClick={load} disabled={!customStart || !customEnd}>Apply</Button>
            </>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-[24px] shadow-soft border border-surface-border hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-text-muted">
              <IndianRupee className="h-4 w-4 text-primary" /> Total Sales
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-primary">
              {loading ? '—' : fmt(s?.totalSalesRevenue ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-text-secondary">{s?.salesCount ?? 0} invoices</p>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] shadow-soft border border-surface-border hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-text-muted">
              <ShoppingCart className="h-4 w-4 text-blue-500" /> Total Purchases
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-blue-600">
              {loading ? '—' : fmt(s?.totalPurchaseCost ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-text-secondary">{s?.purchasesCount ?? 0} purchase orders</p>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] shadow-soft border border-surface-border hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-text-muted">
              <RotateCcw className="h-4 w-4 text-orange-500" /> Net Returns
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-orange-600">
              {loading ? '—' : fmt(s?.totalReturnsAmount ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-text-secondary">{s?.returnsCount ?? 0} return entries</p>
          </CardContent>
        </Card>

        <Card className={`rounded-[24px] shadow-soft hover:-translate-y-1 transition-all duration-300 hover:shadow-bento border-2 ${isProfit ? 'border-success/30 bg-success-bg' : 'border-danger/30 bg-danger-bg'}`}>
          <CardHeader className="pb-2">
            <CardDescription className={`flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs ${isProfit ? 'text-success-text' : 'text-danger-text'}`}>
              {isProfit
                ? <TrendingUp className="h-4 w-4 text-success" />
                : <TrendingDown className="h-4 w-4 text-danger" />}
              Gross Profit
            </CardDescription>
            <CardTitle className={`text-3xl font-extrabold ${isProfit ? 'text-success' : 'text-danger'}`}>
              {loading ? '—' : fmt(s?.grossProfit ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-xs font-semibold ${isProfit ? 'text-success-text/70' : 'text-danger-text/70'}`}>Revenue − Purchases − Returns</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-surface-border">
        {(['sales', 'purchases', 'returns'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-bold capitalize transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary hover:border-surface-border/50'
            }`}
          >
            {tab === 'sales' ? `Sales ${data?.sales.length ? `(${data.sales.length})` : ''}` :
             tab === 'purchases' ? `Purchases ${data?.purchases.length ? `(${data.purchases.length})` : ''}` :
             `Returns ${data?.returns.length ? `(${data.returns.length})` : ''}`}
          </button>
        ))}
      </div>

      <Card className="rounded-[24px] border-surface-border shadow-soft overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm font-bold text-text-muted">Loading Data...</div>
          ) : activeTab === 'sales' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-surface-muted/50 border-b border-surface-border">
                  <TableRow>
                    <TableHead className="font-bold text-text-secondary">Date</TableHead>
                    <TableHead className="font-bold text-text-secondary">Invoice</TableHead>
                    <TableHead className="font-bold text-text-secondary">Customer</TableHead>
                    <TableHead className="font-bold text-text-secondary">Items</TableHead>
                    <TableHead className="font-bold text-text-secondary">Payment</TableHead>
                    <TableHead className="font-bold text-text-secondary">Type</TableHead>
                    <TableHead className="text-right font-bold text-text-secondary">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center font-semibold text-sm text-text-muted">
                        No sales found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.sales.map((row) => (
                    <TableRow key={row.id} className="hover:bg-surface-muted transition-colors border-b border-surface-muted/50">
                      <TableCell className="text-sm font-medium text-text-secondary">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-bold text-text-primary">{row.invoiceNumber}</TableCell>
                      <TableCell className="font-medium text-text-primary">{row.customer}</TableCell>
                      <TableCell className="font-bold text-text-secondary">{row.itemCount}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-xl border border-surface-border bg-surface px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-text-primary shadow-sm">{row.paymentMode}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-surface-border px-3 py-1 text-[10px] uppercase tracking-wider font-bold shadow-sm ${row.saleType === 'WHOLESALE' ? 'bg-surface-muted text-text-secondary' : 'bg-primary/10 text-primary border-primary/20'}`}>
                          {row.saleType}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-lg font-extrabold text-primary">
                        {fmt(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : activeTab === 'purchases' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-surface-muted/50 border-b border-surface-border">
                  <TableRow>
                    <TableHead className="font-bold text-text-secondary">Date</TableHead>
                    <TableHead className="font-bold text-text-secondary">Invoice</TableHead>
                    <TableHead className="font-bold text-text-secondary">Supplier</TableHead>
                    <TableHead className="font-bold text-text-secondary">Items</TableHead>
                    <TableHead className="font-bold text-text-secondary">Payment</TableHead>
                    <TableHead className="font-bold text-text-secondary">Status</TableHead>
                    <TableHead className="text-right font-bold text-text-secondary">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center font-semibold text-sm text-text-muted">
                        No purchases found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.purchases.map((row) => (
                    <TableRow key={row.id} className="hover:bg-surface-muted transition-colors border-b border-surface-muted/50">
                      <TableCell className="text-sm font-medium text-text-secondary">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-bold text-text-primary">{row.invoiceNumber}</TableCell>
                      <TableCell className="font-medium text-text-primary">{row.supplier}</TableCell>
                      <TableCell className="font-bold text-text-secondary">{row.itemCount}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-xl border border-surface-border bg-surface px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-text-primary shadow-sm">{row.paymentType}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-surface-border px-3 py-1 text-[10px] uppercase tracking-wider font-bold shadow-sm ${row.status === 'PAID' ? 'bg-success-bg/50 text-success-text border-success/20' : 'bg-danger-bg text-danger-text border-danger/20'}`}>
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-lg font-extrabold text-blue-600">
                        {fmt(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-surface-muted/50 border-b border-surface-border">
                  <TableRow>
                    <TableHead className="font-bold text-text-secondary">Date</TableHead>
                    <TableHead className="font-bold text-text-secondary">Type</TableHead>
                    <TableHead className="font-bold text-text-secondary">Medicine</TableHead>
                    <TableHead className="font-bold text-text-secondary">Qty</TableHead>
                    <TableHead className="font-bold text-text-secondary">Reason</TableHead>
                    <TableHead className="text-right font-bold text-text-secondary">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center font-semibold text-sm text-text-muted">
                        No returns found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.returns.map((row) => (
                    <TableRow key={row.id} className="hover:bg-surface-muted transition-colors border-b border-surface-muted/50">
                      <TableCell className="text-sm font-medium text-text-secondary">{fmtDate(row.date)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-surface-border px-3 py-1 text-[10px] uppercase font-bold tracking-wider shadow-sm ${row.type === 'CUSTOMER_RETURN' ? 'bg-surface text-text-secondary' : 'bg-surface-muted text-text-primary'}`}>
                          {row.type === 'CUSTOMER_RETURN' ? 'Customer' : 'Supplier'}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-text-primary">{row.medicine}</TableCell>
                      <TableCell className="font-bold text-text-secondary">{row.quantity}</TableCell>
                      <TableCell className="text-sm font-medium text-text-secondary">{row.reason}</TableCell>
                      <TableCell className="text-right text-lg font-extrabold text-orange-600">
                        {fmt(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
