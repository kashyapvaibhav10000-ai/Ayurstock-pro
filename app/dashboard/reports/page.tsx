'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, FileBarChart, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

export default function ReportsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  const [hasData, setHasData] = useState(false); 

  if (!isAuthorized) return null;

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Generate insights, view sales trends, and export your data.
          </p>
        </div>
      </header>

      {/* Report Filters */}
      <Card className="rounded-2xl border-surface-border">
        <CardContent className="p-4 md:p-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-auto flex-1 space-y-2">
            <label className="text-sm font-medium text-text-secondary">Start Date</label>
            <Input type="date" className="w-full" />
          </div>
          <div className="w-full md:w-auto flex-1 space-y-2">
            <label className="text-sm font-medium text-text-secondary">End Date</label>
            <Input type="date" className="w-full" />
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button className="flex-1 md:flex-none gap-2 px-6">
              <Filter className="h-4 w-4" />
              Generate
            </Button>
            <Button variant="outline" className="flex-1 md:flex-none gap-2 px-6" disabled={!hasData}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {!hasData ? (
        <Card className="rounded-2xl border-surface-border min-h-[400px] flex items-center justify-center bg-surface-muted">
          <CardContent className="flex flex-col items-center text-center p-12">
            <div className="h-16 w-16 bg-surface rounded-2xl flex items-center justify-center border border-surface-border shadow-sm mb-6">
              <FileBarChart className="h-8 w-8 text-text-muted" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary">No report data available</h3>
            <p className="text-sm text-text-secondary mt-2 max-w-sm mb-6">
              There is currently no sales or inventory data available to generate reports for the selected date range.
            </p>
            <Button variant="outline" onClick={() => setHasData(true)} className="hidden">
              Simulate Data (Dev Only)
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Report Cards (Hidden when empty) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <Card className="rounded-2xl border-surface-border">
              <CardContent className="p-5 md:p-6">
                <p className="text-sm font-medium text-text-secondary">Total Sales</p>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mt-1">₹0</h2>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-surface-border">
              <CardContent className="p-5 md:p-6">
                <p className="text-sm font-medium text-text-secondary">Total Bills</p>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mt-1">0</h2>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-surface-border">
              <CardContent className="p-5 md:p-6">
                <p className="text-sm font-medium text-text-secondary">Credit Sales</p>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mt-1">₹0</h2>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-surface-border">
              <CardContent className="p-5 md:p-6">
                <p className="text-sm font-medium text-text-secondary">GST Collected</p>
                <h2 className="text-2xl md:text-3xl font-bold text-text-primary mt-1">₹0</h2>
              </CardContent>
            </Card>
          </div>

          {/* Table (Hidden when empty) */}
          <Card className="rounded-2xl border-surface-border">
            <CardHeader>
              <CardTitle className="text-lg">Daily Sales Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-surface-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted/50">
                    <tr className="border-b border-surface-border text-left">
                      <th className="p-4 font-medium text-text-secondary">Date</th>
                      <th className="p-4 font-medium text-text-secondary">Sales Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Data would map here */}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
