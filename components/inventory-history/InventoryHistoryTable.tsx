'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { batchLabel } from '@/lib/batch';
import { cn } from '@/lib/utils';

export const MOVEMENT_TYPES = [
  'PURCHASE',
  'MANUAL_ADD',
  'SALE',
  'WHOLESALE_SALE',
  'RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT',
  'DELETE',
  'RESTORE',
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

const TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE: 'Purchase',
  MANUAL_ADD: 'Manual Add',
  SALE: 'Sale',
  WHOLESALE_SALE: 'Wholesale',
  RETURN: 'Return',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  ADJUSTMENT: 'Adjustment',
  DELETE: 'Deleted',
  RESTORE: 'Restored',
};

const TYPE_STYLE: Record<MovementType, string> = {
  PURCHASE: 'bg-success/10 text-success border-success/20',
  MANUAL_ADD: 'bg-success/10 text-success border-success/20',
  TRANSFER_IN: 'bg-success/10 text-success border-success/20',
  SALE: 'bg-danger/10 text-danger border-danger/20',
  WHOLESALE_SALE: 'bg-danger/10 text-danger border-danger/20',
  TRANSFER_OUT: 'bg-danger/10 text-danger border-danger/20',
  RETURN: 'bg-warning/10 text-warning border-warning/20',
  ADJUSTMENT: 'bg-primary/10 text-primary border-primary/20',
  DELETE: 'bg-surface-muted text-muted-foreground border-border',
  RESTORE: 'bg-surface-muted text-muted-foreground border-border',
};

export interface MovementRow {
  id: string;
  createdAt: string;
  type: MovementType;
  qtyChange: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  refLabel: string | null;
  note: string | null;
  userName: string | null;
  medicine: { id: string; name: string; company: string };
  batch: { id: string; batchNumber: string; expiryDate: string };
}

export interface MedicineBatchSummary {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  deletedAt: string | null;
}

function referenceLink(row: MovementRow): { href: string; label: string } | null {
  if (!row.refType) return null;
  const label = row.refLabel || row.refType.replace(/_/g, ' ').toLowerCase();
  switch (row.refType) {
    case 'SALE':
      return row.refId ? { href: `/dashboard/billing/invoice/${row.refId}`, label } : null;
    case 'PURCHASE':
      return {
        href: `/dashboard/settings?tab=purchase-history&invoice=${encodeURIComponent(row.refLabel || '')}`,
        label,
      };
    case 'MEDICINE_RETURN':
      return { href: '/dashboard/returns', label: 'Return' };
    case 'SUPPLIER_RETURN':
      return { href: '/dashboard/purchases', label: 'Supplier return' };
    case 'STOCK_ADJUSTMENT':
      return { href: '/dashboard/stock-adjustment', label: 'Adjustment' };
    default:
      return null;
  }
}

/** Local-day bounds as ISO strings so the server filters in the viewer's timezone. */
function dayBoundIso(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  const local = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return local.toISOString();
}

interface Props {
  /** Lock the view to one medicine (per-medicine tab). */
  medicineId?: string;
  /** Called with the medicine's batches when `medicineId` is set. */
  onBatchesLoaded?: (batches: MedicineBatchSummary[]) => void;
  pageSize?: number;
}

export default function InventoryHistoryTable({ medicineId, onBatchesLoaded, pageSize = 50 }: Props) {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [batches, setBatches] = useState<MedicineBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [medicineQuery, setMedicineQuery] = useState('');
  const [type, setType] = useState<'' | MovementType>('');
  const [batchQuery, setBatchQuery] = useState('');
  const [batchId, setBatchId] = useState('');
  const [debouncedText, setDebouncedText] = useState({ medicineQuery: '', batchQuery: '' });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedText({ medicineQuery, batchQuery }), 300);
    return () => clearTimeout(handle);
  }, [medicineQuery, batchQuery]);

  useEffect(() => {
    setPage(1);
  }, [from, to, type, batchId, debouncedText, medicineId]);

  useEffect(() => {
    setBatchId('');
  }, [medicineId]);

  const buildParams = useCallback(() => {
    const params: Record<string, string> = {};
    const fromIso = dayBoundIso(from, false);
    const toIso = dayBoundIso(to, true);
    if (fromIso) params.from = fromIso;
    if (toIso) params.to = toIso;
    if (type) params.type = type;
    if (medicineId) params.medicineId = medicineId;
    else if (debouncedText.medicineQuery.trim()) params.q = debouncedText.medicineQuery.trim();
    if (batchId) params.batchId = batchId;
    else if (debouncedText.batchQuery.trim()) params.batch = debouncedText.batchQuery.trim();
    return params;
  }, [from, to, type, medicineId, batchId, debouncedText]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    axios
      .get('/api/inventory-history', { params: { ...buildParams(), page, pageSize } })
      .then((res) => {
        if (!active) return;
        const data = res.data.data;
        setRows(data.rows);
        setTotal(data.pagination.total);
        setTotalPages(Math.max(1, data.pagination.totalPages));
        if (data.batches) {
          setBatches(data.batches);
          onBatchesLoaded?.(data.batches);
        }
      })
      .catch(() => {
        if (active) toast.error('Failed to load inventory history');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buildParams, page, pageSize, onBatchesLoaded]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/api/inventory-history', {
        params: { ...buildParams(), format: 'csv' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const fieldClass =
    'h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(fieldClass, 'w-full')} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(fieldClass, 'w-full')} />
        </label>
        {!medicineId && (
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Medicine</span>
            <Input
              value={medicineQuery}
              onChange={(e) => setMedicineQuery(e.target.value)}
              placeholder="Search medicine"
              className="h-10 rounded-xl"
            />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as MovementType | '')} className={cn(fieldClass, 'w-full')}>
            <option value="">All types</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Batch</span>
          {medicineId ? (
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={cn(fieldClass, 'w-full')}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {batchLabel(b, b.stockQty)}
                  {b.deletedAt ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={batchQuery}
              onChange={(e) => setBatchQuery(e.target.value)}
              placeholder="Batch no."
              className="h-10 rounded-xl"
            />
          )}
        </label>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={exporting || total === 0}
          className="h-10 rounded-xl gap-2 font-bold"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </Button>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto">
        <Table>
          <TableHeader className="bg-surface-muted/30">
            <TableRow className="border-b border-border hover:bg-transparent">
              {['Date', ...(medicineId ? [] : ['Medicine']), 'Batch', 'Type', 'Qty', 'Balance', 'Reference', 'User'].map((h) => (
                <TableHead
                  key={h}
                  className={cn(
                    'text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap',
                    (h === 'Qty' || h === 'Balance') && 'text-right'
                  )}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No stock movements match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const ref = referenceLink(row);
                return (
                  <TableRow key={row.id} className="border-b border-border/50">
                    <TableCell className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    {!medicineId && (
                      <TableCell className="min-w-[160px]">
                        <div className="text-[13px] font-extrabold text-foreground">{row.medicine.name}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {row.medicine.company}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs whitespace-nowrap">{batchLabel(row.batch)}</TableCell>
                    <TableCell>
                      <span
                        title={row.note || undefined}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap',
                          TYPE_STYLE[row.type]
                        )}
                      >
                        {TYPE_LABEL[row.type]}
                      </span>
                      {row.note && (
                        <div className="mt-1 text-[10px] text-muted-foreground max-w-[220px] truncate" title={row.note}>
                          {row.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-black font-mono',
                        row.qtyChange > 0 && 'text-success',
                        row.qtyChange < 0 && 'text-danger',
                        row.qtyChange === 0 && 'text-muted-foreground'
                      )}
                    >
                      {row.qtyChange > 0 ? `+${row.qtyChange}` : row.qtyChange}
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono text-foreground">{row.balanceAfter}</TableCell>
                    <TableCell className="text-[11px] whitespace-nowrap">
                      {ref ? (
                        <Link href={ref.href} className="font-bold text-primary hover:underline">
                          {ref.label}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{row.refType ? row.refType.replace(/_/g, ' ').toLowerCase() : '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] font-bold text-foreground whitespace-nowrap">{row.userName || '—'}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-muted-foreground">
          {total.toLocaleString('en-IN')} movement{total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="h-9 w-9 p-0 rounded-xl"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Page <span className="text-primary">{page}</span> of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="h-9 w-9 p-0 rounded-xl"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
