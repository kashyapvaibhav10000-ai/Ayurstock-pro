'use client';

import { DollarSign, Plus, TrendingUp, Package, AlertTriangle, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import AddMedicineChoiceModal from "@/components/dashboard/AddMedicineChoiceModal";
import { useRouter } from "next/navigation";

type SaleDate = { date: string; totalAmount: number };

type DashboardMetrics = {
  totalSalesToday: number;
  totalSalesWeek: number;
  newCustomers: number;
  lowStockCount: number;
  expiryCount: number;
  salesByDate: SaleDate[];
};

function RevenueChart({ data, isLoading }: { data: SaleDate[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-[220px] w-full rounded-xl" />;

  const hasData = data.length > 0 && data.some(d => d.totalAmount > 0);
  if (!hasData) {
    return (
      <div className="h-[220px] flex items-center justify-center text-text-muted text-sm gap-2">
        <TrendingUp className="h-4 w-4" />
        No sales in the last 7 days
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.totalAmount), 1);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-[220px] flex items-end gap-2 px-2 pb-2">
      {data.map((d, i) => {
        const pct = Math.max((d.totalAmount / max) * 100, d.totalAmount > 0 ? 4 : 0);
        const date = new Date(d.date);
        const isToday = i === data.length - 1;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full flex flex-col items-center justify-end h-[170px]">
              {d.totalAmount > 0 && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-semibold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  ₹{d.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              )}
              <div
                className={`w-full rounded-t-lg transition-all duration-500 ${isToday ? 'bg-primary' : 'bg-primary/30 hover:bg-primary/50'}`}
                style={{ height: `${pct}%`, minHeight: d.totalAmount > 0 ? '6px' : '0' }}
              />
            </div>
            <span className={`text-[10px] font-medium ${isToday ? 'text-primary font-bold' : 'text-text-muted'}`}>
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
        // Fetch today's sales
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Fetch last 7 days for chart
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 6);
        weekAgo.setHours(0, 0, 0, 0);

        const [todayRes, weekRes] = await Promise.all([
          fetch(`/api/sales?startDate=${today.toISOString()}&endDate=${endOfDay.toISOString()}&limit=200`),
          fetch(`/api/sales?startDate=${weekAgo.toISOString()}&endDate=${endOfDay.toISOString()}&limit=500`),
        ]);

        let totalSalesToday = 0;
        let totalSalesWeek = 0;
        let newCustomers = 0;
        const salesByDate: SaleDate[] = [];

        if (todayRes.ok) {
          const result = await todayRes.json();
          const sales = result.data?.sales || [];
          totalSalesToday = sales.reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'), 0);
          newCustomers = sales.filter((s: any) => s.customer).length;
        }

        if (weekRes.ok) {
          const result = await weekRes.json();
          const sales = result.data?.sales || [];
          totalSalesWeek = sales.reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'), 0);

          // Group by date for chart (last 7 days)
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
          totalSalesWeek: Math.round(totalSalesWeek * 100) / 100,
          newCustomers,
          lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
          expiryCount: alertsData?.expiryAlerts?.length ?? 0,
          salesByDate,
        });
      } catch {
        setMetrics({
          totalSalesToday: 0,
          totalSalesWeek: 0,
          newCustomers: 0,
          lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
          expiryCount: alertsData?.expiryAlerts?.length ?? 0,
          salesByDate: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [alertsData]);

  const hasAnySales = metrics && (metrics.totalSalesToday > 0 || metrics.salesByDate.some(d => d.totalAmount > 0));

  return (
    <>
      <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Dashboard</h1>
            <p className="text-text-secondary text-sm mt-1">Overview of your shop&apos;s daily performance.</p>
          </div>
          <Button className="w-full sm:w-auto gap-2" onClick={() => setIsChoiceModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Medicine
          </Button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            iconBg="bg-emerald-50 text-emerald-600"
            title="Sales Today"
            value={isLoading ? null : `₹${(metrics?.totalSalesToday ?? 0).toLocaleString('en-IN')}`}
            isLoading={isLoading}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            iconBg="bg-blue-50 text-blue-600"
            title="This Week"
            value={isLoading ? null : `₹${(metrics?.totalSalesWeek ?? 0).toLocaleString('en-IN')}`}
            isLoading={isLoading}
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            iconBg="bg-orange-50 text-orange-500"
            title="Low Stock"
            value={isAlertsLoading ? null : (metrics?.lowStockCount ?? 0).toString()}
            isLoading={isAlertsLoading}
            onClick={() => router.push('/dashboard/inventory')}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            iconBg="bg-purple-50 text-purple-600"
            title="Customers Today"
            value={isLoading ? null : (metrics?.newCustomers ?? 0).toString()}
            isLoading={isLoading}
          />
        </div>

        {/* Main Content Area */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart Area */}
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Revenue — Last 7 Days</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Daily sales totals</CardDescription>
                </div>
                {!isLoading && metrics && (
                  <div className="text-right">
                    <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">Week Total</p>
                    <p className="text-lg font-bold text-text-primary">
                      ₹{metrics.totalSalesWeek.toLocaleString('en-IN')}
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {!isLoading && !hasAnySales ? (
                <div className="flex flex-col items-center justify-center text-center space-y-5 py-12">
                  <div className="h-16 w-16 bg-primary-light rounded-2xl flex items-center justify-center border border-primary/20">
                    <Package className="h-8 w-8 text-primary" />
                  </div>
                  <div className="max-w-sm">
                    <h3 className="text-lg font-bold text-text-primary">Welcome to AyurStock Pro!</h3>
                    <p className="text-sm text-text-secondary mt-1 leading-relaxed">
                      Start by adding medicines to your inventory, then bill your first customer to see revenue data here.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button className="gap-2 h-10 px-5" onClick={() => setIsChoiceModalOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add Medicine
                    </Button>
                    <Button variant="outline" className="h-10 px-5" onClick={() => router.push('/dashboard/billing')}>
                      Start Billing
                    </Button>
                  </div>
                </div>
              ) : (
                <RevenueChart data={metrics?.salesByDate ?? []} isLoading={isLoading} />
              )}
            </CardContent>
          </Card>

          {/* Alerts Sidebar */}
          <div className="h-full">
            <AlertsPanel />
          </div>
        </section>
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

function StatCard({
  icon,
  iconBg,
  title,
  value,
  isLoading,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  value: string | null | undefined;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${iconBg}`}>{icon}</div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-text-muted uppercase truncate">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-20 mt-1 rounded-md" />
            ) : (
              <p className="text-2xl font-extrabold tracking-tight text-text-primary mt-0.5 truncate">{value ?? '0'}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
