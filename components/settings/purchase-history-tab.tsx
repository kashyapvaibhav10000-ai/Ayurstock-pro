'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileImage, Loader2, ReceiptText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { batchLabel } from '@/lib/batch';
import { cn } from '@/lib/utils';

type Source = 'INVOICE' | 'AI_IMPORT' | 'MANUAL';

const SOURCE_LABEL: Record<Source, string> = { INVOICE: 'Invoice', AI_IMPORT: 'AI Import', MANUAL: 'Manual' };
const SOURCE_STYLE: Record<Source, string> = {
  INVOICE: 'bg-primary/10 text-primary border-primary/20',
  AI_IMPORT: 'bg-warning/10 text-warning border-warning/20',
  MANUAL: 'bg-surface-muted text-muted-foreground border-border',
};

interface PurchaseRow {
  id: string;
  invoiceDate: string;
  source: Source;
  supplier: { id: string; name: string };
  invoiceNumber: string;
  itemCount: number;
  taxable: string;
  gst: string;
  total: string;
  enteredBy: string | null;
  documentId: string | null;
  notes: string | null;
}

interface PurchaseLine {
  id: string;
  medicine: { name: string; company: string };
  batch: { batchNumber: string; expiryDate: string };
  packing: string | null;
  packType?: string | null;
  unitsPerPack?: number | null;
  pricePerPack?: string | null;
  quantity: number;
  freeQty: number;
  purchaseRate: string | null;
  mrp: string;
  gst: string;
}

const inr = (value: string | number) =>
  `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dayBoundIso(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  return (end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d)).toISOString();
}

function packInfo(line: PurchaseLine): string {
  if (line.packType && line.unitsPerPack && line.unitsPerPack > 1) {
    const packs = line.quantity / line.unitsPerPack;
    return `${Number.isInteger(packs) ? packs : packs.toFixed(2)} × ${line.packType} of ${line.unitsPerPack}`;
  }
  if (line.packType) return line.packType;
  return line.packing || '—';
}

function LineItems({ purchaseId }: { purchaseId: string }) {
  const [lines, setLines] = useState<PurchaseLine[] | null>(null);

  useEffect(() => {
    axios
      .get(`/api/purchase-history/${purchaseId}`)
      .then((res) => setLines(res.data.data))
      .catch(() => {
        toast.error('Failed to load purchase lines');
        setLines([]);
      });
  }, [purchaseId]);

  if (!lines) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <th className="text-left py-2 px-3">Medicine</th>
            <th className="text-left py-2 px-3">Batch</th>
            <th className="text-left py-2 px-3">Pack</th>
            <th className="text-right py-2 px-3">Qty (units)</th>
            <th className="text-right py-2 px-3">Free</th>
            <th className="text-right py-2 px-3">Rate / unit</th>
            <th className="text-right py-2 px-3">MRP</th>
            <th className="text-right py-2 px-3">GST</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-border/50">
              <td className="py-2 px-3">
                <div className="font-bold text-foreground">{line.medicine.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{line.medicine.company}</div>
              </td>
              <td className="py-2 px-3 font-mono whitespace-nowrap">{batchLabel(line.batch)}</td>
              <td className="py-2 px-3 whitespace-nowrap">{packInfo(line)}</td>
              <td className="py-2 px-3 text-right font-bold font-mono">{line.quantity}</td>
              <td className="py-2 px-3 text-right font-mono">{line.freeQty || '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{line.purchaseRate ? inr(line.purchaseRate) : '—'}</td>
              <td className="py-2 px-3 text-right font-mono">{inr(line.mrp)}</td>
              <td className="py-2 px-3 text-right font-mono">{inr(line.gst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PurchaseHistoryTab() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [source, setSource] = useState<'' | Source>('');
  const [invoice, setInvoice] = useState(searchParams.get('invoice') || '');
  const [debouncedInvoice, setDebouncedInvoice] = useState(invoice);

  // Deep links from Inventory History (?invoice=) while already on settings.
  useEffect(() => {
    const fromUrl = searchParams.get('invoice');
    if (fromUrl !== null) setInvoice(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedInvoice(invoice), 300);
    return () => clearTimeout(handle);
  }, [invoice]);

  useEffect(() => {
    axios
      .get('/api/suppliers')
      .then((res) => setSuppliers(res.data.data || []))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    setPage(1);
    setExpanded(null);
  }, [from, to, supplierId, source, debouncedInvoice]);

  const buildParams = useCallback(() => {
    const params: Record<string, string> = {};
    const fromIso = dayBoundIso(from, false);
    const toIso = dayBoundIso(to, true);
    if (fromIso) params.from = fromIso;
    if (toIso) params.to = toIso;
    if (supplierId) params.supplierId = supplierId;
    if (source) params.source = source;
    if (debouncedInvoice.trim()) params.invoice = debouncedInvoice.trim();
    return params;
  }, [from, to, supplierId, source, debouncedInvoice]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    axios
      .get('/api/purchase-history', { params: { ...buildParams(), page, pageSize: 25 } })
      .then((res) => {
        if (!active) return;
        setRows(res.data.data.rows);
        setTotal(res.data.data.pagination.total);
        setTotalPages(Math.max(1, res.data.data.pagination.totalPages));
      })
      .catch(() => {
        if (active) toast.error('Failed to load purchase history');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buildParams, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/api/purchase-history', {
        params: { ...buildParams(), format: 'csv' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `purchase-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('CSV export failed');
    } finally {
      setExporting(false);
    }
  };

  const fieldClass =
    'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardHeader className="pb-6 border-b border-border">
        <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <ReceiptText className="h-5 w-5 text-primary" />
          </div>
          Purchase History
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Every stock inflow: distributor invoices, AI imports and manual additions. Expand a row for its lines.
        </p>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Distributor</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={fieldClass}>
              <option value="">All distributors</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value as Source | '')} className={fieldClass}>
              <option value="">All sources</option>
              {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoice No</span>
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Search invoice" className="h-10 rounded-xl" />
          </label>
          <Button variant="outline" onClick={exportCsv} disabled={exporting || total === 0} className="h-10 rounded-xl gap-2 font-bold">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        <div className="rounded-2xl border border-border overflow-x-auto">
          <Table>
            <TableHeader className="bg-surface-muted/30">
              <TableRow className="border-b border-border hover:bg-transparent">
                {['', 'Date', 'Source', 'Distributor', 'Invoice No', 'Items', 'Taxable', 'GST', 'Total', 'Entered By'].map((h, i) => (
                  <TableHead
                    key={h || i}
                    className={cn(
                      'text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap',
                      ['Items', 'Taxable', 'GST', 'Total'].includes(h) && 'text-right'
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
                  <TableCell colSpan={10} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No purchases match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isOpen = expanded === row.id;
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className="border-b border-border/50 cursor-pointer hover:bg-primary/[0.02]"
                        onClick={() => setExpanded(isOpen ? null : row.id)}
                      >
                        <TableCell className="w-8">
                          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                        </TableCell>
                        <TableCell className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                          {new Date(row.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <span className={cn('px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap', SOURCE_STYLE[row.source])}>
                            {SOURCE_LABEL[row.source]}
                          </span>
                        </TableCell>
                        <TableCell className="text-[13px] font-bold text-foreground">{row.supplier.name}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            {row.invoiceNumber}
                            {row.documentId && (
                              <a
                                href={`/api/purchase-documents/${row.documentId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:text-primary-dark"
                                title="Open original invoice"
                              >
                                <FileImage className="h-4 w-4" />
                              </a>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-bold">{row.itemCount}</TableCell>
                        <TableCell className="text-right font-mono">{inr(row.taxable)}</TableCell>
                        <TableCell className="text-right font-mono">{inr(row.gst)}</TableCell>
                        <TableCell className="text-right font-mono font-black text-foreground">{inr(row.total)}</TableCell>
                        <TableCell className="text-[12px] font-bold whitespace-nowrap">{row.enteredBy || '—'}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-surface-muted/20 hover:bg-surface-muted/20">
                          <TableCell colSpan={10} className="p-3">
                            {row.notes && <p className="px-3 pb-2 text-[11px] text-muted-foreground">{row.notes}</p>}
                            <LineItems purchaseId={row.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-muted-foreground">
            {total.toLocaleString('en-IN')} purchase{total === 1 ? '' : 's'}
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
      </CardContent>
    </Card>
  );
}
