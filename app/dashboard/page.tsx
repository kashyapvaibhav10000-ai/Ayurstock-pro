'use client';

import { 
  TrendingUp, Pill, CalendarClock, ShoppingCart, 
  ChevronRight, AlertTriangle, Plus, FileText, Users, DollarSign 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import AddMedicineChoiceModal from "@/components/dashboard/AddMedicineChoiceModal";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

type SaleDate = { date: string; totalAmount: number };

type DashboardMetrics = {
  totalSalesToday: number;
  totalSalesWeek: number;
  gstCollectedToday: number;
  newCustomers: number;
  lowStockCount: number;
  salesByDate: SaleDate[];
  recentSales: any[];
};

function RevenueChart({ data, isLoading }: { data: SaleDate[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-[180px] w-full rounded-2xl" />;

  const hasData = data.length > 0 && data.some(d => d.totalAmount > 0);
  if (!hasData) {
    return (
      <div className="h-[180px] flex items-center justify-center text-stitch-onSurfaceVariant text-[13px]">
        No performance data for this period
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.totalAmount), 1);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-[180px] flex items-end gap-3 px-1 pb-1">
      {data.map((d, i) => {
        const pct = Math.max((d.totalAmount / max) * 100, d.totalAmount > 0 ? 4 : 0);
        const date = new Date(d.date);
        const isToday = i === data.length - 1;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="relative w-full flex flex-col items-center justify-end h-[140px]">
              {d.totalAmount > 0 && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-stitch-onSurface text-white text-[10px] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                  ₹{d.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              )}
              <div
                className={`w-full rounded-t-[4px] transition-all ${isToday ? 'bg-stitch-primary' : 'bg-stitch-surfaceLow hover:bg-stitch-primaryContainer'}`}
                style={{ height: `${pct}%`, minHeight: d.totalAmount > 0 ? '8px' : '0' }}
              />
            </div>
            <span className={`text-[10px] font-semibold ${isToday ? 'text-stitch-primary' : 'text-stitch-outlineVariant'}`}>
              {days[date.getDay()]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { data: alertsData, isLoading: isAlertsLoading } = useInventoryAlerts();
  const router = useRouter();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);

        const [todayRes, weekRes] = await Promise.all([
          fetch(`/api/sales?startDate=${today.toISOString()}&endDate=${endOfDay.toISOString()}&limit=5`),
          fetch(`/api/sales?startDate=${weekAgo.toISOString()}&endDate=${endOfDay.toISOString()}&limit=500`),
        ]);

        let totalSalesToday = 0;
        let gstCollectedToday = 0;
        let totalSalesWeek = 0;
        let newCustomers = 0;
        let recentSales: any[] = [];
        const salesByDate: SaleDate[] = [];

        if (todayRes.ok) {
          const result = await todayRes.json();
          recentSales = result.data?.sales || [];
          totalSalesToday = recentSales.reduce((sum, s) => sum + parseFloat(s.grandTotal || '0'), 0);
          gstCollectedToday = recentSales.reduce((sum, s) => sum + parseFloat(s.gstTotal || '0'), 0);
          newCustomers = recentSales.filter(s => s.customer).length;
        }

        if (weekRes.ok) {
          const result = await weekRes.json();
          const sales = result.data?.sales || [];
          totalSalesWeek = sales.reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'), 0);

          const byDate: Record<string, number> = {};
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            byDate[d.toISOString().split('T')[0]] = 0;
          }
          sales.forEach((s: any) => {
            const dateKey = new Date(s.createdAt).toISOString().split('T')[0];
            if (dateKey in byDate) byDate[dateKey] += parseFloat(s.grandTotal || '0');
          });
          Object.entries(byDate).forEach(([date, totalAmount]) => {
            salesByDate.push({ date, totalAmount: Math.round(totalAmount * 100) / 100 });
          });
        }

        setMetrics({
          totalSalesToday: Math.round(totalSalesToday * 100) / 100,
          gstCollectedToday: Math.round(gstCollectedToday * 100) / 100,
          totalSalesWeek: Math.round(totalSalesWeek * 100) / 100,
          newCustomers,
          lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
          salesByDate,
          recentSales
        });
      } catch {
        setMetrics({
          totalSalesToday: 0, gstCollectedToday: 0, totalSalesWeek: 0, newCustomers: 0,
          lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
          salesByDate: [], recentSales: []
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [alertsData]);

  // Stitch UI Typography & Layout
  return (
    <>
      <div className="bg-stitch-background min-h-full font-sans text-stitch-onSurface selection:bg-stitch-primaryContainer p-6 md:p-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div className="flex items-baseline gap-4">
            <h1 className="text-sm font-semibold tracking-[0.2em] text-stitch-onSurfaceVariant uppercase">
              COMMAND CENTER V1.2
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-stitch-onSurfaceVariant font-medium">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-stitch-primary animate-pulse" />
              Live Processing
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column */}
          <div className="lg:col-span-3 space-y-8 flex flex-col">
            
            {/* Financial Pulse */}
            <div className="bg-stitch-surfaceLowest rounded-[24px] p-6 shadow-[0_12px_32px_rgba(43,53,47,0.03)] border-none relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-[11px] font-bold tracking-[0.1em] uppercase text-stitch-onSurfaceVariant">
                  Financial Pulse
                </h2>
                <DollarSign className="w-4 h-4 text-stitch-primary" />
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-xs text-stitch-onSurfaceVariant font-medium pb-1">Total Sales (Today)</p>
                  {isLoading ? <Skeleton className="h-9 w-32" /> : (
                    <div className="flex items-baseline gap-3">
                      <p className="text-3xl font-extrabold text-stitch-primary tracking-tight">
                        ₹{(metrics?.totalSalesToday || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                </div>
                
                <div>
                  <p className="text-xs text-stitch-onSurfaceVariant font-medium pb-1">GST Collected</p>
                  {isLoading ? <Skeleton className="h-6 w-24" /> : (
                    <p className="text-lg font-bold text-stitch-onSurface">
                      ₹{(metrics?.gstCollectedToday || 0).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <div className="flex justify-between text-xs font-bold text-stitch-onSurfaceVariant mb-2">
                    <span>Performance Target</span>
                    <span className="text-stitch-primary">98.2%</span>
                  </div>
                  <div className="h-[4px] w-full bg-stitch-surfaceLow rounded-full overflow-hidden">
                    <div className="h-full bg-stitch-primary rounded-full w-[98.2%]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Shop Pulse */}
            <div className="bg-stitch-surfaceLowest rounded-[24px] p-6 shadow-[0_12px_32px_rgba(43,53,47,0.03)] border-none">
              <div className="flex justify-between items-start mb-5">
                <h2 className="text-[11px] font-bold tracking-[0.1em] uppercase text-stitch-onSurfaceVariant">
                  Active Vitality
                </h2>
                <Users className="w-4 h-4 text-stitch-primary" />
              </div>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-stitch-onSurface">Customers Today</p>
                    <p className="text-[11px] text-stitch-onSurfaceVariant mt-0.5">In-store & Billed</p>
                  </div>
                  <span className="text-sm font-bold bg-stitch-surfaceLow text-stitch-primary px-3 py-1 rounded-full">
                    {metrics?.newCustomers || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-stitch-onSurface">Low Stock Items</p>
                    <p className="text-[11px] text-stitch-onSurfaceVariant mt-0.5">Requires Re-order</p>
                  </div>
                  <span className="text-sm font-bold bg-stitch-errorContainer/20 text-stitch-onSurface px-3 py-1 rounded-full">
                    {metrics?.lowStockCount || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Herb of the Day (Soft Visual Element) */}
            <div className="mt-auto bg-gradient-to-br from-stitch-primary to-stitch-primaryDim rounded-[24px] p-6 text-stitch-surfaceLowest relative overflow-hidden shadow-[0_16px_32px_rgba(0,109,79,0.2)]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-white/70 uppercase mb-2">Notice</h3>
              <p className="text-lg font-bold mb-1 shadow-sm">Daily Verification</p>
              <p className="text-[11px] text-white/80 leading-relaxed font-medium">
                Ensure all incoming stock purchases are logged before EOD.
              </p>
            </div>

          </div>

          {/* Center Column */}
          <div className="lg:col-span-6 space-y-8">
            
            {/* Transaction Monitor */}
            <div className="bg-stitch-surfaceLowest rounded-[24px] p-7 shadow-[0_12px_32px_rgba(43,53,47,0.03)] flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-bold text-stitch-onSurface">Transaction Monitor</h2>
                  <p className="text-[13px] text-stitch-onSurfaceVariant mt-1">Real-time prescription processing</p>
                </div>
                <Button variant="ghost" className="text-stitch-primary hover:bg-stitch-surfaceLow hover:text-stitch-primary text-xs font-bold px-3 tracking-wide" onClick={() => router.push('/dashboard/sales-history')}>
                  VIEW ALL
                </Button>
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-stitch-surfaceLow">
                      <th className="pb-4 text-[10px] font-bold text-stitch-onSurfaceVariant uppercase tracking-wider pl-2">ID / Time</th>
                      <th className="pb-4 text-[10px] font-bold text-stitch-onSurfaceVariant uppercase tracking-wider">Customer</th>
                      <th className="pb-4 text-[10px] font-bold text-stitch-onSurfaceVariant uppercase tracking-wider text-right">Amount</th>
                      <th className="pb-4 text-[10px] font-bold text-stitch-onSurfaceVariant uppercase tracking-wider text-right pr-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-stitch-surfaceLow last:border-0 hover:bg-stitch-surfaceLow/50 transition-colors">
                          <td className="py-4 pl-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-10 mt-1" /></td>
                          <td className="py-4"><Skeleton className="h-4 w-24" /></td>
                          <td className="py-4"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="py-4"><Skeleton className="h-6 w-20 ml-auto rounded-full" /></td>
                        </tr>
                      ))
                    ) : metrics?.recentSales.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center text-sm text-stitch-onSurfaceVariant">No transactions today</td></tr>
                    ) : (
                      metrics?.recentSales.map((sale: any) => (
                        <tr key={sale.id} className="border-b border-stitch-surfaceLow last:border-0 hover:bg-stitch-surfaceLow/60 transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/sales-history`)}>
                          <td className="py-4 pl-2">
                            <p className="text-[13px] font-bold text-stitch-onSurface">#{sale.invoiceNumber}</p>
                            <p className="text-[11px] text-stitch-onSurfaceVariant mt-0.5">{format(new Date(sale.createdAt), 'HH:mm')}</p>
                          </td>
                          <td className="py-4">
                            <p className="text-[13px] font-semibold text-stitch-onSurface">{sale.customer?.name || "Walk-in"}</p>
                          </td>
                          <td className="py-4 text-right">
                            <p className="text-[14px] font-bold text-stitch-primary">₹{parseFloat(sale.grandTotal).toLocaleString('en-IN')}</p>
                          </td>
                          <td className="py-4 text-right pr-2">
                            <span className="inline-flex items-center text-[10px] font-bold px-3 py-1.5 rounded-full bg-stitch-primaryContainer/30 text-stitch-primary tracking-wide">
                              COMPLETED
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="lg:col-span-3 space-y-8 flex flex-col">
            
            {/* Stock Vitality */}
            <div className="bg-stitch-surfaceLowest rounded-[24px] p-6 shadow-[0_12px_32px_rgba(43,53,47,0.03)] border-none">
              <h2 className="text-[11px] font-bold tracking-[0.1em] uppercase text-stitch-onSurfaceVariant mb-5">
                Stock Vitality
              </h2>
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-[#fff7f6] p-4 flex justify-between items-center group cursor-pointer border border-[#fa746f]/20 hover:bg-[#ffeaea] transition-colors" onClick={() => router.push('/dashboard/inventory')}>
                  <div>
                    <p className="text-[13px] font-bold text-[#6e0a12]">Critical Low</p>
                    <p className="text-[11px] text-[#93000a]/70 mt-0.5 max-w-[120px] truncate">
                      {isAlertsLoading ? 'Loading...' : alertsData?.lowStockMedicines?.slice(0,2).map((m: any) => m.name).join(', ') || 'No critical items'}
                    </p>
                  </div>
                  <p className="text-base font-extrabold text-[#ba1a1a]">{metrics?.lowStockCount || 0}</p>
                </div>
                
                <div className="relative overflow-hidden rounded-xl bg-stitch-surfaceLow p-4 flex justify-between items-center group cursor-pointer border border-stitch-primaryContainer/50 hover:bg-[#e4efe5] transition-colors" onClick={() => router.push('/dashboard/inventory')}>
                  <div>
                    <p className="text-[13px] font-bold text-stitch-primaryDim">Optimal Stock</p>
                    <p className="text-[11px] text-stitch-primary/70 mt-0.5">Ready for processing</p>
                  </div>
                  <div className="h-6 w-6 rounded-full bg-stitch-primaryContainer/50 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-stitch-primary" />
                  </div>
                </div>
              </div>
            </div>

            {/* Commander Actions */}
            <div>
              <h2 className="text-[11px] font-bold tracking-[0.1em] uppercase text-stitch-onSurfaceVariant mb-4 pl-1">
                Commander Actions
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <ActionButton icon={Plus} label="New Prescription" onClick={() => router.push('/dashboard/billing')} />
                <ActionButton icon={Pill} label="Quick Stock" onClick={() => setIsChoiceModalOpen(true)} />
                <ActionButton icon={Users} label="Add Customer" onClick={() => router.push('/dashboard/billing')} />
                <ActionButton icon={FileText} label="Daily Report" onClick={() => router.push('/dashboard/reports')} />
              </div>
              <Button 
                variant="outline" 
                className="w-full mt-3 h-11 text-xs font-bold tracking-widest uppercase border-stitch-outlineVariant/30 text-stitch-primary hover:bg-stitch-surfaceLow hover:text-stitch-primary rounded-[12px]"
              >
                Custom Actions
              </Button>
            </div>

            {/* Intraday Performance */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4 pl-1">
                <h2 className="text-[11px] font-bold tracking-[0.1em] uppercase text-stitch-onSurfaceVariant">
                  Intraday Performance
                </h2>
                <TrendingUp className="w-3.5 h-3.5 text-stitch-primary" />
              </div>
              <div className="bg-stitch-surfaceLowest rounded-[24px] p-5 shadow-[0_12px_32px_rgba(43,53,47,0.03)]">
                <RevenueChart data={metrics?.salesByDate ?? []} isLoading={isLoading} />
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-stitch-surfaceLow">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-stitch-primary rounded-full" />
                    <span className="text-[11px] font-bold text-stitch-onSurfaceVariant uppercase">Sales Volume</span>
                  </div>
                  <span className="text-xs font-bold text-stitch-onSurface">7 Days</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {isChoiceModalOpen && (
        <AddMedicineChoiceModal
          isOpen={isChoiceModalOpen}
          onClose={() => setIsChoiceModalOpen(false)}
          onSelectImport={() => router.push('/dashboard/medicines?action=import')}
          onSelectManual={() => router.push('/dashboard/medicines?action=manual')}
        />
      )}
    </>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 bg-stitch-surfaceLowest border border-stitch-outlineVariant/20 p-4 rounded-[16px] hover:border-stitch-primary/30 hover:bg-[#fcfdfc] transition-all group shadow-[0_4px_12px_rgba(0,0,0,0.02)]"
    >
      <Icon className="w-5 h-5 text-stitch-primary group-hover:scale-110 transition-transform" />
      <span className="text-[10px] font-bold text-stitch-onSurface text-center leading-tight tracking-wide">
        {label}
      </span>
    </button>
  );
}
