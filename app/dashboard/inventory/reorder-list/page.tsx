'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { Printer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReorderItem {
  medicineName: string;
  company: string;
  category: string;
  packing: string | null;
  hsn: string;
  currentStock: number;
  threshold: number;
  lastPurchaseRate: number;
  mrp: number;
  supplier: { name: string; phone: string; email: string } | null;
}

export default function ReorderListPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    if (!isAuthorized) router.replace('/dashboard');
  }, [isAuthorized, router]);

  useEffect(() => {
    if (!isAuthorized) return;
    setLoading(true);
    axios.get(`/api/inventory/reorder-list?threshold=${threshold}`)
      .then((res) => { if (res.data.success) setItems(res.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthorized, threshold]);

  if (!isAuthorized) return null;

  return (
    <div className="space-y-4 p-6 md:p-8 max-w-[1200px] mx-auto print:p-4 print:max-w-full">
      {/* Header — hidden on print */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-title-1 sm:text-large-title text-foreground">Low Stock Reorder List</h1>
            <p className="text-sm text-text-secondary">Medicines at or below stock threshold</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-12 sm:pl-0">
          <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
            Threshold ≤
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
              min={0}
            />
          </label>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print List
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold">Low Stock Reorder List</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}Showing stock ≤ {threshold} units
        </p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 print:hidden">
          No medicines below threshold of {threshold}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-surface-border print:rounded-none print:border-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-surface-muted print:bg-surface-muted">
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">#</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">Medicine</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">Company</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">Pack</th>
                <th className="text-center px-4 py-3 font-semibold text-foreground border-b border-border">Stock</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground border-b border-border">Rate</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground border-b border-border">MRP</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground border-b border-border">Phone</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className={`border-b border-border ${idx % 2 === 0 ? 'bg-surface' : 'bg-surface-muted'} ${item.currentStock === 0 ? 'text-danger font-semibold' : ''}`}>
                  <td className="px-4 py-2.5">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{item.medicineName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.company}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.packing || '-'}</td>
                  <td className="px-4 py-2.5 text-center font-bold">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${item.currentStock === 0 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                      {item.currentStock}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">₹{item.lastPurchaseRate.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right">₹{item.mrp.toFixed(2)}</td>
                  <td className="px-4 py-2.5">{item.supplier?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.supplier?.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-muted border-t-2 border-border">
                <td colSpan={9} className="px-4 py-3 text-xs text-muted-foreground">
                  Total: {items.length} medicines need reordering
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #__next, #__next * { visibility: visible; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
}
