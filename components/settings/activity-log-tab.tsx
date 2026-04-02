'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import axios from "axios";

function formatMeta(action: string, metaRaw: string | null): string {
  if (!metaRaw) return '—';

  try {
    const meta = JSON.parse(metaRaw);

    switch (action) {
      case 'CREATE_SALE': {
        const inv = meta.invoiceNumber || meta.invoice || '—';
        const total = meta.grandTotal ?? meta.total ?? '—';
        const payment = meta.paymentMode || meta.payment || '';
        const formatted = typeof total === 'number' ? `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `₹${total}`;
        return `Sold ${inv} for ${formatted}${payment ? ` via ${payment}` : ''}`;
      }

      case 'CREATE_PURCHASE': {
        const supplier = meta.supplierName || meta.supplier || 'Unknown Supplier';
        const total = meta.totalAmount ?? meta.total ?? '—';
        const formatted = typeof total === 'number' ? `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `₹${total}`;
        return `Recorded purchase from ${supplier} — ${formatted}`;
      }

      case 'CREATE_RETURN': {
        const medName = meta.medicineName || meta.medicine || 'Unknown Medicine';
        const amount = meta.amount ?? meta.mrp ?? '';
        const qty = meta.quantity ?? '';
        let result = `Returned ${medName}`;
        if (qty) result += ` ×${qty}`;
        if (amount) {
          const formatted = typeof amount === 'number' ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `₹${amount}`;
          result += ` — ${formatted}`;
        }
        return result;
      }

      case 'STOCK_ADJUSTMENT': {
        const medName = meta.medicineName || meta.medicine || 'Item';
        const batch = meta.batchNumber || meta.batch || '';
        const qty = meta.quantity ?? meta.qty ?? 0;
        const type = meta.type || '';
        const sign = type === 'REMOVE' ? '-' : '+';
        return `Adjusted ${medName}${batch ? ` batch ${batch}` : ''}: ${sign}${Math.abs(qty)} units`;
      }

      case 'DATABASE_RESTORE_AUTO_BACKUP': {
        const ts = meta.timestamp ? new Date(meta.timestamp).toLocaleString() : '';
        const counts = meta.recordCounts;
        if (counts) {
          const total = (counts.medicines || 0) + (counts.inventoryBatches || 0) + (counts.suppliers || 0);
          return `Auto-backup created before restore${ts ? ` at ${ts}` : ''} (${total} records saved)`;
        }
        return `Auto-backup created before restore${ts ? ` at ${ts}` : ''}`;
      }

      case 'DATABASE_RESTORE': {
        const restored = meta.medicinesRestored ?? meta.medicines ?? '';
        return `Database restored${restored ? ` — ${restored} medicines processed` : ''}`;
      }

      case 'CLEAR_ALL': {
        return `All database records cleared`;
      }

      case 'DELETE_BY_COMPANY': {
        const company = meta.companyName || meta.company || 'Unknown';
        const count = meta.deletedCount ?? '';
        return `Deleted ${count ? `${count} medicines from` : 'medicines from'} ${company}`;
      }

      default: {
        // Fallback: show truncated raw JSON
        const raw = typeof metaRaw === 'string' ? metaRaw : JSON.stringify(meta);
        return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
      }
    }
  } catch {
    // Not valid JSON — return truncated raw string
    return metaRaw.length > 120 ? metaRaw.slice(0, 117) + '…' : metaRaw;
  }
}

export default function ActivityLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/activity-log?page=${p}&limit=50`);
      if (response.data.success) {
        setLogs(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between pb-6 space-y-0 border-b border-border">
        <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          Audit Trail
        </CardTitle>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-primary/5 hover:text-primary transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="bg-background border border-border px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Page <span className="text-primary">{page}</span> of {totalPages}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-primary/5 hover:text-primary transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-surface-muted/30">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-6">Date / Time</TableHead>
              <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Officer</TableHead>
              <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Operation</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pr-6">Data Trace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  No activity logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors group">
                  <TableCell className="text-[11px] font-bold text-muted-foreground whitespace-nowrap pl-6">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-extrabold text-[13px] text-foreground">
                    {log.user?.name || 'SYSTEM_CORE'}
                  </TableCell>
                  <TableCell>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground pr-6 max-w-[400px]">
                    <span className="font-medium">{formatMeta(log.action, log.meta)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
