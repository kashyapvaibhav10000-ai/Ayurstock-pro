'use client';

import { ArrowUpRight, Bell, DollarSign, X } from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { useInventoryAlerts } from "@/hooks/useInventoryAlerts";

const mockSalesData = [
  { month: "Jan", revenue: 12000 },
  { month: "Feb", revenue: 15000 },
  { month: "Mar", revenue: 14000 },
  { month: "Apr", revenue: 18000 },
  { month: "May", revenue: 20000 },
  { month: "Jun", revenue: 22000 },
  { month: "Jul", revenue: 21000 },
  { month: "Aug", revenue: 23000 },
  { month: "Sep", revenue: 24000 },
  { month: "Oct", revenue: 26000 },
  { month: "Nov", revenue: 28000 },
  { month: "Dec", revenue: 30000 },
];

export default function DashboardPage() {
  const { data: alertsData } = useInventoryAlerts();
  const lowStockCount = alertsData?.lowStockMedicines?.length ?? 0;

  return (
    <div className="space-y-8 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
          Add Inventory
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          icon={<DollarSign className="h-6 w-6 text-green-500" />}
          title="Total Sales This Month"
          value="$25,000"
          change={+5.4}
        />
        <StatCard
          icon={<Bell className="h-6 w-6 text-yellow-500" />}
          title="Low Stock Alerts"
          value={`${lowStockCount}`}
          change={-2.3}
        />
        <StatCard
          icon={<ArrowUpRight className="h-6 w-6 text-blue-500" />}
          title="New Customers"
          value="54"
          change={+3.1}
        />
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-80 rounded-lg bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-medium">Monthly Revenue</h2>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mockSalesData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div>
          <AlertsPanel />
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, title, value, change }: {icon: React.ReactNode; title: string; value: string; change: number;}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
      <div className="flex items-center space-x-4">
        {icon}
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </div>
      <ChangeBadge change={change} />
    </div>
  );
}

function ChangeBadge({ change }: { change: number }) {
  const isPositive = change >= 0;
  return (
    <div
      className={`flex items-center rounded-full px-2 py-1 text-xs font-medium 
        ${isPositive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
    >
      {isPositive ? "+" : ""}
      {change}%
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600"
      onClick={onClick}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
