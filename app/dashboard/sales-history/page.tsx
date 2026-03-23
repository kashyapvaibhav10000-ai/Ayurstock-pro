'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Sales History</h1>
          <p className="mt-1 text-sm text-slate-500">Track revenue, purchases, returns, and overall profit.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
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
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
              <span className="text-slate-400 text-sm">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
              <Button size="sm" onClick={load} disabled={!customStart || !customEnd}>Apply</Button>
            </>
          )}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <IndianRupee className="h-4 w-4 text-emerald-500" /> Total Sales
            </CardDescription>
            <CardTitle className="text-2xl text-emerald-600">
              {loading ? '—' : fmt(s?.totalSalesRevenue ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{s?.salesCount ?? 0} invoices</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4 text-blue-500" /> Total Purchases
            </CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {loading ? '—' : fmt(s?.totalPurchaseCost ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{s?.purchasesCount ?? 0} purchase orders</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4 text-orange-500" /> Net Returns
            </CardDescription>
            <CardTitle className="text-2xl text-orange-600">
              {loading ? '—' : fmt(s?.totalReturnsAmount ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">{s?.returnsCount ?? 0} return entries</p>
          </CardContent>
        </Card>

        <Card className={`rounded-2xl border-2 ${isProfit ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              {isProfit
                ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                : <TrendingDown className="h-4 w-4 text-red-500" />}
              Gross Profit
            </CardDescription>
            <CardTitle className={`text-2xl ${isProfit ? 'text-emerald-700' : 'text-red-600'}`}>
              {loading ? '—' : fmt(s?.grossProfit ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400">Revenue − Purchases − Returns</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['sales', 'purchases', 'returns'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-emerald-500 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'sales' ? `Sales (${data?.sales.length ?? 0})` :
             tab === 'purchases' ? `Purchases (${data?.purchases.length ?? 0})` :
             `Returns (${data?.returns.length ?? 0})`}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading...</div>
          ) : activeTab === 'sales' ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                        No sales in this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.sales.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm text-slate-500">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{row.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.paymentMode}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.saleType === 'WHOLESALE' ? 'secondary' : 'outline'}>
                          {row.saleType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">
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
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                        No purchases in this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.purchases.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm text-slate-500">{fmtDate(row.date)}</TableCell>
                      <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                      <TableCell>{row.supplier}</TableCell>
                      <TableCell>{row.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.paymentType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'PAID' ? 'secondary' : 'destructive'}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-700">
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
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">
                        No returns in this period.
                      </TableCell>
                    </TableRow>
                  ) : data?.returns.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50">
                      <TableCell className="text-sm text-slate-500">{fmtDate(row.date)}</TableCell>
                      <TableCell>
                        <Badge variant={row.type === 'CUSTOMER_RETURN' ? 'outline' : 'secondary'}>
                          {row.type === 'CUSTOMER_RETURN' ? 'Customer' : 'Supplier'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{row.medicine}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.reason}</TableCell>
                      <TableCell className="text-right font-semibold text-orange-700">
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
