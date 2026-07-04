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
import CommanderActionsConfig, { CommanderAction, DEFAULT_ACTIONS } from "@/components/commander-actions-config";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import * as Icons from "lucide-react";

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
      <div className="h-[180px] flex items-center justify-center text-muted-foreground text-[13px] font-medium">
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
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap shadow-lg">
                  ₹{d.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              )}
              <div
                className={`w-full rounded-t-[4px] transition-all duration-300 ${isToday ? 'bg-primary shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'bg-surface-muted/50 hover:bg-primary/20'}`}
                style={{ height: `${pct}%`, minHeight: d.totalAmount > 0 ? '8px' : '0' }}
              />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
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
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [commanderActions, setCommanderActions] = useState<CommanderAction[]>(DEFAULT_ACTIONS);

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

        const [todayRes, weekRes, settingsRes] = await Promise.all([
          fetch(`/api/sales?startDate=${today.toISOString()}&endDate=${endOfDay.toISOString()}&limit=5`),
          fetch(`/api/sales?startDate=${weekAgo.toISOString()}&endDate=${endOfDay.toISOString()}&limit=500`),
          fetch(`/api/settings`),
        ]);

        let totalSalesToday = 0;
        let gstCollectedToday = 0;
        let totalSalesWeek = 0;
        let newCustomers = 0;
        let recentSales: any[] = [];
        const salesByDate: SaleDate[] = [];

        if (settingsRes.ok) {
          const settingsObj = await settingsRes.json();
          if (settingsObj.data?.commanderActions && Array.isArray(settingsObj.data.commanderActions) && settingsObj.data.commanderActions.length > 0) {
            setCommanderActions(settingsObj.data.commanderActions);
          }
        }

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
      <div className="bg-background min-h-full font-sans text-foreground selection:bg-primary/20 p-6 md:p-10">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div className="flex items-baseline gap-4">
            <h1 className="text-sm font-bold tracking-[0.25em] text-muted-foreground uppercase">
              COMMAND CENTER V1.2
            </h1>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-bold uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
              Live Processing
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column */}
          <div className="lg:col-span-3 space-y-8 flex flex-col">
            
            {/* Financial Pulse */}
            <div className="bg-surface rounded-[24px] p-6 shadow-soft hover:shadow-bento transition-all duration-300 border border-border relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
                  Financial Pulse
                </h2>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1">Total Sales (Today)</p>
                  {isLoading ? <Skeleton className="h-9 w-32" /> : (
                    <div className="flex items-baseline gap-3">
                      <p className="text-3xl font-extrabold text-primary tracking-tight">
                        ₹{(metrics?.totalSalesToday || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                </div>
                
                <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1">GST Collected</p>
                  {isLoading ? <Skeleton className="h-6 w-24" /> : (
                    <p className="text-lg font-extrabold text-foreground">
                      ₹{(metrics?.gstCollectedToday || 0).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    <span>Sales This Week</span>
                    <span className="text-primary">
                      ₹{(metrics?.totalSalesWeek || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Shop Pulse */}
            <div className="bg-surface rounded-[24px] p-6 shadow-soft hover:shadow-bento transition-all duration-300 border border-border">
              <div className="flex justify-between items-start mb-5">
                <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
                  Active Vitality
                </h2>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Customers Today</p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">In-store & Billed</p>
                  </div>
                  <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                    {metrics?.newCustomers || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Low Stock Items</p>
                    <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Requires Re-order</p>
                  </div>
                  <span className="text-xs font-bold bg-danger/10 text-danger px-3 py-1 rounded-full border border-danger/20">
                    {metrics?.lowStockCount || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Herb of the Day (Soft Visual Element) */}
            <div className="mt-auto bg-primary/5 rounded-[24px] p-6 border border-primary/20 text-foreground relative overflow-hidden shadow-soft">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <h3 className="text-[10px] font-bold tracking-[0.25em] text-primary uppercase mb-2">Notice</h3>
              <p className="text-lg font-extrabold text-foreground mb-1">Daily Verification</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-bold">
                Ensure all incoming stock purchases are logged before EOD.
              </p>
            </div>

          </div>

          {/* Center Column */}
          <div className="lg:col-span-6 space-y-8">
            
            {/* Transaction Monitor */}
            <div className="bg-surface rounded-[24px] p-7 shadow-soft hover:shadow-bento transition-all duration-300 border border-border flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground tracking-tight">Transaction Monitor</h2>
                  <p className="text-[13px] font-medium text-muted-foreground mt-1">Real-time prescription processing</p>
                </div>
                <Button variant="ghost" className="text-primary hover:bg-primary/5 hover:text-primary text-[10px] font-black tracking-[0.15em] px-4 py-2 border border-primary/10 uppercase" onClick={() => router.push('/dashboard/sales-history')}>
                  VIEW MONITOR
                </Button>
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/30">
                      <th className="py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] pl-4">ID / Time</th>
                      <th className="py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Customer</th>
                      <th className="py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-right">Amount</th>
                      <th className="py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-right pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-primary/[0.02] transition-colors font-medium">
                          <td className="py-4 pl-4"><Skeleton className="h-4 w-16" /><Skeleton className="h-3 w-10 mt-1" /></td>
                          <td className="py-4"><Skeleton className="h-4 w-24" /></td>
                          <td className="py-4 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                          <td className="py-4 text-right pr-4"><Skeleton className="h-6 w-20 ml-auto rounded-full" /></td>
                        </tr>
                      ))
                    ) : metrics?.recentSales.length === 0 ? (
                        <tr><td colSpan={4} className="py-12 text-center text-[13px] font-bold text-muted-foreground uppercase tracking-widest">No transactions today</td></tr>
                    ) : (
                      metrics?.recentSales.map((sale: any) => (
                        <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-primary/[0.03] transition-colors group cursor-pointer" onClick={() => router.push(`/dashboard/sales-history`)}>
                          <td className="py-4 pl-4">
                            <p className="text-[13px] font-extrabold text-foreground">#{sale.invoiceNumber}</p>
                            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">{format(new Date(sale.createdAt), 'HH:mm')}</p>
                          </td>
                          <td className="py-4">
                            <p className="text-[13px] font-bold text-foreground">{sale.customer?.name || "Walk-in"}</p>
                          </td>
                          <td className="py-4 text-right">
                            <p className="text-[14px] font-extrabold text-primary">₹{parseFloat(sale.grandTotal).toLocaleString('en-IN')}</p>
                          </td>
                          <td className="py-4 text-right pr-4">
                            <span className="inline-flex items-center text-[10px] font-black px-3 py-1.5 rounded-full bg-primary/10 text-primary tracking-widest uppercase border border-primary/20">
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
            <div className="bg-surface rounded-[24px] p-6 shadow-soft hover:shadow-bento transition-all duration-300 border border-border">
              <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-5">
                Stock Vitality
              </h2>
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-danger/10 p-4 flex justify-between items-center group cursor-pointer border border-danger/20 hover:bg-danger/20 transition-colors" onClick={() => router.push('/dashboard/inventory')}>
                  <div>
                    <p className="text-[13px] font-extrabold text-danger">Critical Low</p>
                    <p className="text-[11px] font-bold text-danger/70 mt-0.5 max-w-[120px] truncate uppercase tracking-widest">
                      {isAlertsLoading ? 'Loading...' : alertsData?.lowStockMedicines?.slice(0,2).map((m: any) => m.name).join(', ') || 'No critical items'}
                    </p>
                  </div>
                  <p className="text-xl font-black text-danger">{metrics?.lowStockCount || 0}</p>
                </div>
                
                <div className="relative overflow-hidden rounded-xl bg-surface p-4 flex justify-between items-center group cursor-pointer border border-border hover:bg-primary/5 hover:border-primary/30 transition-all duration-300" onClick={() => router.push('/dashboard/inventory')}>
                  <div>
                    <p className="text-[13px] font-extrabold text-foreground">Optimal Stock</p>
                    <p className="text-[11px] font-bold text-muted-foreground mt-0.5 uppercase tracking-widest">Ready for processing</p>
                  </div>
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                    <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_5px_rgba(212,175,55,1)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Commander Actions */}
            <div>
              <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-muted-foreground mb-4 pl-1">
                Commander Actions
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {commanderActions.map((action, i) => (
                  <ActionButton 
                    key={i} 
                    iconName={action.icon} 
                    label={action.label} 
                    onClick={() => {
                      if (action.label === 'Quick Stock') {
                        setIsChoiceModalOpen(true);
                      } else {
                        router.push(action.route);
                      }
                    }} 
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                onClick={() => setIsConfigOpen(true)}
                className="w-full mt-3 h-11 text-[10px] font-black tracking-[0.2em] uppercase border-border/50 text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 rounded-[12px] transition-all"
              >
                Custom Actions
              </Button>
            </div>

            {/* Intraday Performance */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4 pl-1">
                <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-muted-foreground">
                  Intraday Performance
                </h2>
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-surface rounded-[24px] p-5 shadow-soft hover:shadow-bento transition-all duration-300 border border-border">
                <RevenueChart data={metrics?.salesByDate ?? []} isLoading={isLoading} />
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-primary rounded-full shadow-[0_0_5px_rgba(212,175,55,0.5)]" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Sales Volume</span>
                  </div>
                  <span className="text-[10px] font-black text-foreground uppercase tracking-widest">7 Days</span>
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

      {isConfigOpen && (
        <CommanderActionsConfig
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          currentActions={commanderActions}
          onSave={(actions) => setCommanderActions(actions)}
        />
      )}
    </>
  );
}

function ActionButton({ iconName, label, onClick }: { iconName: string, label: string, onClick: () => void }) {
  const Icon = (Icons as any)[iconName] || Icons.HelpCircle;
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 bg-surface border border-border p-4 rounded-[16px] hover:border-primary/40 hover:bg-primary/[0.03] transition-all group shadow-soft active:scale-[0.98]"
    >
      <Icon className="w-5 h-5 text-primary group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.3)] transition-transform duration-300" />
      <span className="text-[10px] font-bold text-foreground text-center leading-tight tracking-widest uppercase">
        {label}
      </span>
    </button>
  );
}
