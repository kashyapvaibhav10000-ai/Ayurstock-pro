'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileBarChart, Filter, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import axios from "axios";
import { toast } from "sonner";

type ReportData = {
  totalSales: number;
  totalBills: number;
  creditSales: number;
  gstCollected: number;
};

export default function ReportsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    setIsLoading(true);
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const response = await axios.get('/api/sales', {
        params: { startDate: start.toISOString(), endDate: end.toISOString(), limit: 500 },
      });

      const sales = response.data?.data?.sales || [];
      const totalSales = sales.reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'), 0);
      const creditSales = sales
        .filter((s: any) => s.paymentMode === 'CREDIT')
        .reduce((sum: number, s: any) => sum + parseFloat(s.grandTotal || '0'), 0);
      const gstCollected = sales.reduce((sum: number, s: any) => sum + parseFloat(s.gstTotal || '0'), 0);

      setReportData({
        totalSales: Math.round(totalSales * 100) / 100,
        totalBills: sales.length,
        creditSales: Math.round(creditSales * 100) / 100,
        gstCollected: Math.round(gstCollected * 100) / 100,
      });

      if (sales.length === 0) {
        toast.info('No sales found for the selected period');
      } else {
        toast.success(`Report generated: ${sales.length} bills found`);
      }
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthorized) return null;

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Reports & Analytics</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Generate insights, view sales trends, and export your data.
          </p>
        </div>
      </header>

      {/* Report Filters */}
      <Card className="rounded-[24px] border-border bg-surface shadow-soft">
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Today', days: 0 },
              { label: 'This Week', days: 6 },
              { label: 'This Month', days: 29 },
              { label: 'Last 3 Months', days: 89 },
            ].map(({ label, days }) => (
              <Button
                key={label}
                size="sm"
                variant="outline"
                className="rounded-xl font-bold border-border hover:bg-primary/5 transition-all"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - days);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-auto flex-1 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Start Date</label>
              <Input type="date" className="w-full rounded-xl border-border bg-surface focus-visible:ring-primary/20" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="w-full md:w-auto flex-1 space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">End Date</label>
              <Input type="date" className="w-full rounded-xl border-border bg-surface focus-visible:ring-primary/20" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Button className="flex-1 md:flex-none gap-2 px-6 rounded-xl font-bold bg-primary hover:bg-primary/90 text-background" onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                {isLoading ? 'Generating...' : 'Generate'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 md:flex-none gap-2 px-6 rounded-xl font-bold border-border"
                disabled={!reportData}
                onClick={() => window.print()}
              >
                <Download className="h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportData ? (
        <Card className="rounded-[24px] border-border min-h-[400px] flex items-center justify-center bg-surface-muted/30">
          <CardContent className="flex flex-col items-center text-center p-12">
            <div className="h-20 w-20 bg-surface rounded-3xl flex items-center justify-center border border-border shadow-soft mb-6">
              <FileBarChart className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-extrabold text-foreground">Select a date range to begin</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mb-6 font-medium">
              Choose your start and end dates above, then click <strong>Generate</strong> to view your sales report.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
            <CardContent className="p-5 md:p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Sales</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">₹{reportData.totalSales.toLocaleString()}</h2>
            </CardContent>
          </Card>
          <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
            <CardContent className="p-5 md:p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Bills</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">{reportData.totalBills}</h2>
            </CardContent>
          </Card>
          <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
            <CardContent className="p-5 md:p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Credit Sales</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">₹{reportData.creditSales.toLocaleString()}</h2>
            </CardContent>
          </Card>
          <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
            <CardContent className="p-5 md:p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">GST Collected</p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">₹{reportData.gstCollected.toLocaleString()}</h2>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
