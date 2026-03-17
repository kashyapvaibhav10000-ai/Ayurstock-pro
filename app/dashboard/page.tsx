'use client';

import { ArrowUpRight, Bell, DollarSign, PackageOpen, Plus, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

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
  
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real application, this would fetch from a Next.js /api route.
    // For now, we simulate an empty database state to ensure the empty UI renders properly.
    const fetchMetrics = async () => {
      try {
        // const response = await fetch('/api/dashboard/metrics');
        // const data = await response.json();
        
        // Simulating an empty app state after arbitrary delay
        setTimeout(() => {
          setMetrics({
            totalSalesToday: 0,
            newCustomers: 0,
            lowStockCount: alertsData?.lowStockMedicines?.length ?? 0,
            salesByDate: [],
          });
          setIsLoading(false);
        }, 800);
      } catch (error) {
        console.error("Failed to fetch dashboard metrics", error);
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [alertsData]);

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">Overview of your shop's daily performance.</p>
        </div>
        <Button className="w-full sm:w-auto gap-2">
          <Plus className="h-4 w-4" />
          Add Inventory
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
              // Proper Empty State
              <div className="flex flex-col items-center justify-center text-center space-y-4 py-12">
                <div className="h-16 w-16 bg-surface-muted rounded-2xl flex items-center justify-center border border-surface-border">
                  <PackageOpen className="h-8 w-8 text-text-muted" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-text-primary">No sales recorded yet</h3>
                  <p className="text-sm text-text-secondary mt-1 max-w-sm mx-auto">
                    Start by adding your first product to the inventory so you can begin processing bills.
                  </p>
                </div>
                <Button variant="outline" className="mt-2 gap-2">
                  <Plus className="h-4 w-4" />
                  Add First Product
                </Button>
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
