'use client';

import { ArrowUpRight, Bell, DollarSign, PackageOpen, Plus, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import AddMedicineChoiceModal from "@/components/dashboard/AddMedicineChoiceModal";
import { useRouter } from "next/navigation";

// Real Schema Data Types defined in our contract
type SaleDate = {
  date: string;
  totalAmount: number;
};

type DashboardMetrics = {
  totalSalesToday: number;
  newCustomers: number;
  lowStockCount: number;
  salesByDate: SaleDate[];
};

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

        const token = localStorage.getItem('token');
        const response = await fetch(
          `/api/sales?startDate=${today.toISOString()}&endDate=${endOfDay.toISOString()}&limit=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.ok) {
          const result = await response.json();
          const sales = result.data?.sales || [];
          const totalSalesToday = sales.reduce(
            (sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'),
            0
          );
          setMetrics({
            totalSalesToday: Math.round(totalSalesToday * 100) / 100,
            newCustomers: sales.filter((s: any) => s.customer).length,
            lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
            salesByDate: [],
          });
        } else {
          setMetrics({
            totalSalesToday: 0,
            newCustomers: 0,
            lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
            salesByDate: [],
          });
        }
      } catch {
        setMetrics({
          totalSalesToday: 0,
          newCustomers: 0,
          lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
          salesByDate: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [alertsData]);

  return (
    <>
      <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Dashboard</h1>
            <p className="text-text-secondary text-sm mt-1">Overview of your shop's daily performance.</p>
          </div>
          <Button className="w-full sm:w-auto gap-2" onClick={() => setIsChoiceModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Medicine
          </Button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<DollarSign className="h-5 w-5 text-success-text" />}
            iconBg="bg-success-bg"
            title="Sales Today"
            value={isLoading ? null : `₹${metrics?.totalSalesToday.toLocaleString()}`}
            isLoading={isLoading}
          />
          <StatCard
            icon={<Bell className="h-5 w-5 text-warning-text" />}
            iconBg="bg-warning-bg"
            title="Low Stock Alerts"
            value={isAlertsLoading || isLoading ? null : metrics?.lowStockCount.toString()}
            isLoading={isAlertsLoading || isLoading}
          />
          <StatCard
            icon={<ArrowUpRight className="h-5 w-5 text-primary" />}
            iconBg="bg-primary-light"
            title="New Customers"
            value={isLoading ? null : metrics?.newCustomers.toString()}
            isLoading={isLoading}
          />
        </div>

        {/* Main Content Area */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart / Revenue Area */}
          <Card className="lg:col-span-2 flex flex-col min-h-[400px]">
            <CardHeader>
              <CardTitle className="text-lg">Revenue Overview</CardTitle>
              <CardDescription>Daily sales performance for the current month.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              {isLoading ? (
                <div className="space-y-4 lg:px-4">
                  <Skeleton className="h-[250px] w-full" />
                </div>
              ) : metrics?.salesByDate && metrics.salesByDate.length > 0 ? (
                <div className="h-[300px] w-full bg-surface-muted rounded-xl border border-dashed border-surface-border flex items-center justify-center">
                  <p className="text-text-muted text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Chart will render when data exists
                  </p>
                </div>
              ) : (
                // Proper Encouraging Empty State
                <div className="flex flex-col items-center justify-center text-center space-y-6 py-16">
                  <div className="h-20 w-20 bg-primary-light rounded-[24px] flex items-center justify-center border border-primary/20 shadow-sm animate-pulse">
                    <Plus className="h-10 w-10 text-primary" />
                  </div>
                  <div className="max-w-md mx-auto">
                    <h3 className="text-xl font-bold text-text-primary">Welcome to AyurStock Pro!</h3>
                    <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                      Your pharmacy's digital heartbeat starts here. Let's get your first medicine added to the inventory so you can begin tracking sales and generating invoices today.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button className="gap-2 h-11 px-6 shadow-md shadow-primary/20" onClick={() => setIsChoiceModalOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add First Medicine
                    </Button>
                    <Button variant="outline" className="h-11 px-6" onClick={() => router.push('/dashboard/settings')}>
                      Complete Shop Profile
                    </Button>
                  </div>
                </div>
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
  isLoading
}: {
  icon: React.ReactNode; 
  iconBg: string;
  title: string; 
  value: string | null | undefined; 
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-xl flex items-center justify-center ${iconBg}`}>
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">{title}</p>
              {isLoading ? (
                <Skeleton className="h-7 w-20 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-text-primary mt-0.5">{value || "0"}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
