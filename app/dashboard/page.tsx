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
  if (isLoading) return <Skeleton className="h-[180px] w-full rounded-xl" />;

  const hasData = data.length > 0 && data.some(d => d.totalAmount > 0);
  if (!hasData) {
    return (
      <div className="h-[180px] flex items-center justify-center text-muted-foreground text-[14px]">
        No sales in the last 7 days
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
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[12px] font-medium px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap shadow-pop tabular-nums">
                  ₹{d.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              )}
              <div
                className={`w-full rounded-[6px] transition-colors duration-200 ${isToday ? 'bg-primary' : 'bg-primary/25 hover:bg-primary/40'}`}
                style={{ height: `${pct}%`, minHeight: d.totalAmount > 0 ? '8px' : '0' }}
              />
            </div>
            <span className={`text-[12px] ${isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
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

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const tile = 'rounded-card bg-surface p-5 sm:p-6 shadow-card';
  const caption = 'text-[13px] font-medium text-muted-foreground';
  const lowNames = alertsData?.lowStockMedicines?.slice(0, 3).map((m: any) => m.name).join(', ');

  return (
    <>
      <div className="min-h-full bg-background p-4 text-foreground sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">{format(new Date(), 'EEEE, d MMMM')}</p>
            <h1 className="mt-0.5 text-large-title text-foreground">{greeting}</h1>
          </div>
          <Button size="lg" className="self-start sm:self-auto" onClick={() => router.push('/dashboard/billing')}>
            <Icons.Plus className="h-[18px] w-[18px] stroke-[2]" />
            New bill
          </Button>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">

          {/* Today's sales */}
          <div className={`${tile} sm:col-span-2 lg:col-span-6`}>
            <p className={caption}>Sales today</p>
            {isLoading ? <Skeleton className="mt-3 h-12 w-48" /> : (
              <p className="mt-2 text-[44px] font-bold leading-none tracking-[-0.035em] tabular-nums text-foreground sm:text-[52px]">
                ₹{(metrics?.totalSalesToday || 0).toLocaleString('en-IN')}
              </p>
            )}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <p className={caption}>GST collected</p>
                {isLoading ? <Skeleton className="mt-1.5 h-6 w-20" /> : (
                  <p className="mt-1 text-title-3 tabular-nums text-foreground">₹{(metrics?.gstCollectedToday || 0).toLocaleString('en-IN')}</p>
                )}
              </div>
              <div>
                <p className={caption}>This week</p>
                {isLoading ? <Skeleton className="mt-1.5 h-6 w-24" /> : (
                  <p className="mt-1 text-title-3 tabular-nums text-foreground">₹{(metrics?.totalSalesWeek || 0).toLocaleString('en-IN')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Customers */}
          <div className={`${tile} flex flex-col lg:col-span-3`}>
            <div className="flex items-center justify-between">
              <p className={caption}>Customers today</p>
              <Users className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground" />
            </div>
            <p className="mt-auto pt-6 text-[44px] font-bold leading-none tracking-[-0.035em] tabular-nums text-foreground">{metrics?.newCustomers || 0}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Billed in store</p>
          </div>

          {/* Low stock */}
          <button
            type="button"
            onClick={() => router.push('/dashboard/inventory')}
            className={`${tile} flex flex-col text-left transition-transform duration-200 active:scale-[0.98] lg:col-span-3`}
          >
            <div className="flex w-full items-center justify-between">
              <p className={caption}>Low stock</p>
              <Icons.ChevronRight className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground" />
            </div>
            <p className={`mt-auto pt-6 text-[44px] font-bold leading-none tracking-[-0.035em] tabular-nums ${(metrics?.lowStockCount || 0) > 0 ? 'text-danger' : 'text-foreground'}`}>
              {metrics?.lowStockCount || 0}
            </p>
            <p className="mt-1.5 w-full truncate text-[13px] text-muted-foreground">
              {isAlertsLoading ? 'Checking stock…' : lowNames || 'Everything is stocked'}
            </p>
          </button>

          {/* Week chart */}
          <div className={`${tile} sm:col-span-2 lg:col-span-7`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-headline text-foreground">Last 7 days</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Daily sales</p>
              </div>
              <TrendingUp className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground" />
            </div>
            <RevenueChart data={metrics?.salesByDate ?? []} isLoading={isLoading} />
          </div>

          {/* Quick actions */}
          <div className={`${tile} sm:col-span-2 lg:col-span-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-headline text-foreground">Quick actions</h2>
              <button type="button" onClick={() => setIsConfigOpen(true)} className="text-[13px] font-medium text-primary hover:underline">
                Customize
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Recent sales */}
          <div className={`${tile} sm:col-span-2 lg:col-span-12`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-headline text-foreground">Today&apos;s bills</h2>
              <button type="button" onClick={() => router.push('/dashboard/sales-history')} className="text-[13px] font-medium text-primary hover:underline">
                See all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2.5 text-footnote font-medium text-muted-foreground">Invoice</th>
                    <th className="py-2.5 text-footnote font-medium text-muted-foreground">Time</th>
                    <th className="py-2.5 text-footnote font-medium text-muted-foreground">Customer</th>
                    <th className="py-2.5 text-right text-footnote font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                        <td className="py-3"><Skeleton className="h-4 w-12" /></td>
                        <td className="py-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="py-3"><Skeleton className="ml-auto h-4 w-16" /></td>
                      </tr>
                    ))
                  ) : metrics?.recentSales.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center">
                        <p className="text-[14px] text-muted-foreground">No bills yet today.</p>
                        <button type="button" onClick={() => router.push('/dashboard/billing')} className="mt-1 text-[14px] font-medium text-primary hover:underline">Start a bill</button>
                      </td>
                    </tr>
                  ) : (
                    metrics?.recentSales.map((sale: any) => (
                      <tr key={sale.id} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-fill/70" onClick={() => router.push(`/dashboard/sales-history`)}>
                        <td className="py-3 font-mono text-[13px] text-foreground">{sale.invoiceNumber}</td>
                        <td className="py-3 text-[13px] tabular-nums text-muted-foreground">{format(new Date(sale.createdAt), 'HH:mm')}</td>
                        <td className="py-3 text-[14px] text-foreground">{sale.customer?.name || 'Walk-in'}</td>
                        <td className="py-3 text-right text-[14px] font-semibold tabular-nums text-foreground">₹{parseFloat(sale.grandTotal).toLocaleString('en-IN')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
      className="flex items-center gap-2.5 rounded-xl bg-fill px-3 py-3 text-left transition-[background-color,transform] duration-200 hover:bg-fill-strong active:scale-[0.97]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12">
        <Icon className="h-4 w-4 stroke-[1.75] text-primary" />
      </span>
      <span className="text-[13px] font-medium leading-tight text-foreground">
        {label}
      </span>
    </button>
  );
}
