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
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Sales History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track revenue, purchases, returns, and overall profit.</p>
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
                className="h-10 rounded-xl border border-border bg-surface px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none font-medium"
              />
              <span className="text-muted-foreground/60 text-sm font-bold">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface px-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none font-medium"
              />
              <Button size="sm" className="rounded-xl shadow-soft" onClick={load} disabled={!customStart || !customEnd}>Apply</Button>
            </>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-[24px] shadow-soft border border-border bg-surface hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-muted-foreground/60">
              <IndianRupee className="h-4 w-4 text-primary" /> Total Sales
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-primary">
              {loading ? '—' : fmt(s?.totalSalesRevenue ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-muted-foreground">{s?.salesCount ?? 0} invoices</p>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] shadow-soft border border-border bg-surface hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-muted-foreground/60">
              <ShoppingCart className="h-4 w-4 text-blue-400" /> Total Purchases
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-blue-400">
              {loading ? '—' : fmt(s?.totalPurchaseCost ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-muted-foreground">{s?.purchasesCount ?? 0} purchase orders</p>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] shadow-soft border border-border bg-surface hover:-translate-y-1 transition-all duration-300 hover:shadow-bento">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs text-muted-foreground/60">
              <RotateCcw className="h-4 w-4 text-orange-400" /> Net Returns
            </CardDescription>
            <CardTitle className="text-3xl font-extrabold text-orange-400">
              {loading ? '—' : fmt(s?.totalReturnsAmount ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-semibold text-muted-foreground">{s?.returnsCount ?? 0} return entries</p>
          </CardContent>
        </Card>

        <Card className={`rounded-[24px] shadow-soft hover:-translate-y-1 transition-all duration-300 hover:shadow-bento border-2 bg-surface ${isProfit ? 'border-primary/20' : 'border-danger/20'}`}>
          <CardHeader className="pb-2">
            <CardDescription className={`flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs ${isProfit ? 'text-primary' : 'text-danger'}`}>
              {isProfit
                ? <TrendingUp className="h-4 w-4" />
                : <TrendingDown className="h-4 w-4" />}
              Gross Profit
            </CardDescription>
            <CardTitle className={`text-3xl font-extrabold ${isProfit ? 'text-primary' : 'text-danger'}`}>
              {loading ? '—' : fmt(s?.grossProfit ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-xs font-semibold ${isProfit ? 'text-muted-foreground' : 'text-muted-foreground'}`}>Revenue − Purchases − Returns</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        {(['sales', 'purchases', 'returns'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-bold capitalize transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border/50'
            }`}
          >
            {tab === 'sales' ? `Sales ${data?.sales.length ? `(${data.sales.length})` : ''}` :
             tab === 'purchases' ? `Purchases ${data?.purchases.length ? `(${data.purchases.length})` : ''}` :
             `Returns ${data?.returns.length ? `(${data.returns.length})` : ''}`}
          </button>
        ))}
      </div>

      <Card className="rounded-[24px] border-border bg-surface shadow-soft overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm font-bold text-muted-foreground">Loading Data...</div>
          ) : activeTab === 'sales' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-surface-muted/50 border-b border-border">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Date</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Invoice</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Customer</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Items</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Payment</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Type</TableHead>
                    <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.sales.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={7} className="py-10 text-center font-semibold text-sm text-muted-foreground">
                        No sales found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.sales.map((row) => (
                    <TableRow key={row.id} className="hover:bg-primary/5 transition-colors border-b border-border">
                      <TableCell className="text-sm font-medium text-muted-foreground">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-bold text-foreground">{row.invoiceNumber}</TableCell>
                      <TableCell className="font-bold text-foreground">{row.customer}</TableCell>
                      <TableCell className="font-bold text-muted-foreground">{row.itemCount}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-foreground shadow-sm">{row.paymentMode}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-border px-3 py-1 text-[10px] uppercase tracking-wider font-bold shadow-sm ${row.saleType === 'WHOLESALE' ? 'bg-surface-muted/50 text-muted-foreground' : 'bg-primary/10 text-primary border-primary/20'}`}>
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
                <TableHeader className="bg-surface-muted/50 border-b border-border">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Date</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Invoice</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Supplier</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Items</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Payment</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.purchases.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={7} className="py-10 text-center font-semibold text-sm text-muted-foreground">
                        No purchases found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.purchases.map((row) => (
                    <TableRow key={row.id} className="hover:bg-primary/5 transition-colors border-b border-border">
                      <TableCell className="text-sm font-medium text-muted-foreground">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-bold text-foreground">{row.invoiceNumber}</TableCell>
                      <TableCell className="font-bold text-foreground">{row.supplier}</TableCell>
                      <TableCell className="font-bold text-muted-foreground">{row.itemCount}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-foreground shadow-sm">{row.paymentType}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-border px-3 py-1 text-[10px] uppercase tracking-wider font-bold shadow-sm ${row.status === 'PAID' ? 'bg-primary/20 text-primary border-primary/20' : 'bg-danger/20 text-danger border-danger/20'}`}>
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-lg font-extrabold text-blue-400">
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
                <TableHeader className="bg-surface-muted/50 border-b border-border">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Date</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Type</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Medicine</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Qty</TableHead>
                    <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Reason</TableHead>
                    <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.returns.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={6} className="py-10 text-center font-semibold text-sm text-muted-foreground">
                        No returns found for this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.returns.map((row) => (
                    <TableRow key={row.id} className="hover:bg-primary/5 transition-colors border-b border-border">
                      <TableCell className="text-sm font-medium text-muted-foreground">{fmtDate(row.date)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-xl border border-border px-3 py-1 text-[10px] uppercase font-bold tracking-wider shadow-sm ${row.type === 'CUSTOMER_RETURN' ? 'bg-background text-muted-foreground' : 'bg-surface-muted/50 text-foreground'}`}>
                          {row.type === 'CUSTOMER_RETURN' ? 'Customer' : 'Supplier'}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">{row.medicine}</TableCell>
                      <TableCell className="font-bold text-muted-foreground">{row.quantity}</TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">{row.reason}</TableCell>
                      <TableCell className="text-right text-lg font-extrabold text-orange-400">
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
