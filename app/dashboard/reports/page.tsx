'use client';

import { useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, IndianRupee, ReceiptText,
  Download, Filter, Loader2, FileBarChart, PackageCheck,
  CreditCard, Wallet, Landmark, Smartphone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  totalRevenue: number;
  totalBills: number;
  totalGst: number;
  totalCredit: number;
  totalCogs: number;
  grossProfit: number;
  profitMargin: number;
}
interface DailyPoint { date: string; totalAmount: number; transactionCount: number; }
interface TopMedicine { name: string; company: string; totalQuantity: number; totalAmount: number; }
interface PaymentSlice { paymentMode: string; count: number; total: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PAYMENT_COLORS: Record<string, string> = {
  CASH: '#16a34a',
  CARD: '#2563eb',
  UPI: '#7c3aed',
  CREDIT: '#dc2626',
};
const PAYMENT_ICONS: Record<string, any> = {
  CASH: Wallet,
  CARD: CreditCard,
  UPI: Smartphone,
  CREDIT: Landmark,
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function StatCard({
  label, value, sub, icon: Icon, color = 'primary',
}: { label: string; value: string; sub?: string; icon: any; color?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-bento p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-${color}/10 border border-${color}/20`}>
          <Icon className={`h-4 w-4 text-${color}`} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black tracking-tight text-foreground">{value}</div>
        {sub && <div className="text-[11px] font-bold text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface shadow-2xl p-3 text-[12px] font-bold">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }} className="flex items-center gap-2">
          <span>{p.name}:</span>
          <span>{typeof p.value === 'number' && p.name.includes('₹') ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [topMedicines, setTopMedicines] = useState<TopMedicine[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentSlice[]>([]);

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const generate = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both dates');
      return;
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const params = { startDate: start.toISOString(), endDate: end.toISOString() };

    setLoading(true);
    try {
      const [summaryRes, dailyRes, topRes, paymentRes] = await Promise.all([
        axios.get('/api/reports', { params: { ...params, type: 'summary' } }),
        axios.get('/api/reports', { params: { ...params, type: 'daily-sales' } }),
        axios.get('/api/reports', { params: { ...params, type: 'top-medicines' } }),
        axios.get('/api/reports', { params: { ...params, type: 'payment-breakdown' } }),
      ]);

      setSummary(summaryRes.data.data?.report || null);

      const daily: DailyPoint[] = (dailyRes.data.data?.report || [])
        .map((d: any) => ({
          date: SHORT_DATE.format(new Date(d.date)),
          totalAmount: Number(d.totalAmount),
          transactionCount: d.transactionCount,
        }))
        .sort((a: DailyPoint, b: DailyPoint) => a.date.localeCompare(b.date));
      setDailyData(daily);

      setTopMedicines(topRes.data.data?.report || []);
      setPaymentData(paymentRes.data.data?.report || []);
      setGenerated(true);

      toast.success('Report generated');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // CSV Export
  const exportCsv = () => {
    if (!dailyData.length) return;
    const rows = [
      ['Date', 'Revenue (₹)', 'Bills'],
      ...dailyData.map((d) => [d.date, d.totalAmount, d.transactionCount]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ayurstock-report-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <FileBarChart className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">Sales</div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Reports & Analytics</h1>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-border bg-surface shadow-bento p-5 space-y-4">
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Today', days: 0 },
            { label: 'This Week', days: 6 },
            { label: 'This Month', days: 29 },
            { label: 'Last 3 Months', days: 89 },
            { label: 'This Year', days: 364 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => setPreset(days)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date Inputs + Actions */}
        <div className="flex flex-wrap items-end gap-4">
          {[
            { label: 'Start Date', value: startDate, onChange: setStartDate },
            { label: 'End Date', value: endDate, onChange: setEndDate },
          ].map(({ label, value, onChange }) => (
            <div key={label} className="flex-1 min-w-[160px] space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{label}</label>
              <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground"
              />
            </div>
          ))}

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[11px] font-black tracking-widest uppercase text-white hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
            {loading ? 'Generating...' : 'Generate'}
          </button>

          {generated && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-2.5 text-[11px] font-black tracking-widest uppercase text-muted-foreground hover:bg-surface-muted transition-all"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!generated && (
        <div className="rounded-2xl border border-border bg-surface min-h-[400px] flex flex-col items-center justify-center text-center p-12 space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-muted/50 border border-border">
            <FileBarChart className="h-10 w-10 text-muted-foreground/30" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">Select a date range to begin</div>
            <p className="text-sm font-bold text-muted-foreground mt-1 max-w-xs">
              Choose your dates above and click Generate to view full analytics
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {generated && summary && (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={fmt(summary.totalRevenue)} sub={`${summary.totalBills} bills`} icon={IndianRupee} />
            <StatCard label="Gross Profit" value={fmt(summary.grossProfit)} sub={`${summary.profitMargin.toFixed(1)}% margin`} icon={TrendingUp} color="primary" />
            <StatCard label="GST Collected" value={fmt(summary.totalGst)} icon={ReceiptText} color="primary" />
            <StatCard label="Credit Sales" value={fmt(summary.totalCredit)} sub="outstanding" icon={ShoppingBag} color="danger" />
          </div>

          {/* Revenue Trend Chart */}
          <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
            <div className="border-b border-border px-6 py-5 bg-surface-muted/30">
              <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Revenue Trend</h2>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">Daily sales over the selected period</p>
            </div>
            <div className="p-4 md:p-6">
              {dailyData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-sm font-black text-muted-foreground">No sales data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="totalAmount" name="₹ Revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bills Trend Chart */}
          <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
            <div className="border-b border-border px-6 py-5 bg-surface-muted/30">
              <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Daily Bill Volume</h2>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">Number of invoices generated per day</p>
            </div>
            <div className="p-4 md:p-6">
              {dailyData.length === 0 ? (
                <div className="flex items-center justify-center h-52 text-sm font-black text-muted-foreground">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyData} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="transactionCount"
                      name="Bills"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bottom Row: Payment Breakdown + Top Medicines */}
          <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
            {/* Payment Mode Pie */}
            <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-surface-muted/30">
                <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Payment Modes</h2>
                <p className="text-[11px] font-bold text-muted-foreground mt-0.5">Breakdown by payment method</p>
              </div>
              <div className="p-4 md:p-6">
                {paymentData.length === 0 ? (
                  <div className="flex items-center justify-center h-52 text-sm font-black text-muted-foreground">No data</div>
                ) : (
                  <div className="space-y-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="total"
                          nameKey="paymentMode"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {paymentData.map((entry) => (
                            <Cell key={entry.paymentMode} fill={PAYMENT_COLORS[entry.paymentMode] || '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => fmt(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {paymentData.map((p) => {
                        const Icon = PAYMENT_ICONS[p.paymentMode] || Wallet;
                        const color = PAYMENT_COLORS[p.paymentMode] || '#94a3b8';
                        return (
                          <div key={p.paymentMode} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}>
                                <Icon className="h-3.5 w-3.5" style={{ color }} />
                              </div>
                              <span className="text-[11px] font-black text-foreground uppercase tracking-wider">{p.paymentMode}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-[12px] font-black text-foreground">{fmt(p.total)}</div>
                              <div className="text-[9px] font-bold text-muted-foreground">{p.count} bills</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top Medicines */}
            <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
              <div className="border-b border-border px-6 py-5 bg-surface-muted/30">
                <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Top 10 Medicines</h2>
                <p className="text-[11px] font-bold text-muted-foreground mt-0.5">By quantity sold in the period</p>
              </div>
              <div className="overflow-auto">
                {topMedicines.length === 0 ? (
                  <div className="flex items-center justify-center h-52 text-sm font-black text-muted-foreground">No data</div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-muted/30">
                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">#</th>
                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Medicine</th>
                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Qty Sold</th>
                        <th className="px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topMedicines.map((med, i) => (
                        <tr key={med.name + i} className="border-b border-surface-muted hover:bg-surface-muted/30 transition-colors">
                          <td className="px-5 py-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-black text-primary">
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-black text-foreground">{med.name}</div>
                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{med.company}</div>
                          </td>
                          <td className="px-5 py-3 text-right text-[13px] font-black text-foreground">{med.totalQuantity}</td>
                          <td className="px-5 py-3 text-right text-[13px] font-black text-primary">{fmt(Number(med.totalAmount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Profit Summary Card */}
          <div className="rounded-2xl border border-border bg-surface shadow-bento p-6">
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase mb-5">Profit Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Revenue', value: fmt(summary.totalRevenue), color: 'text-foreground' },
                { label: 'Cost of Goods', value: fmt(summary.totalCogs), color: 'text-muted-foreground' },
                { label: 'Gross Profit', value: fmt(summary.grossProfit), color: summary.grossProfit >= 0 ? 'text-primary' : 'text-danger' },
                { label: 'Profit Margin', value: `${summary.profitMargin.toFixed(1)}%`, color: summary.profitMargin >= 0 ? 'text-primary' : 'text-danger' },
              ].map(({ label, value, color }) => (
                <div key={label} className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
                  <div className={`text-xl font-black ${color}`}>{value}</div>
                </div>
              ))}
            </div>
            {/* Simple bar: Revenue vs COGS */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <span>Revenue</span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: '100%' }} />
                </div>
                <span>{fmt(summary.totalRevenue)}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <span>COGS &nbsp;&nbsp;</span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-danger/60"
                    style={{ width: `${summary.totalRevenue > 0 ? (summary.totalCogs / summary.totalRevenue) * 100 : 0}%` }}
                  />
                </div>
                <span>{fmt(summary.totalCogs)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
