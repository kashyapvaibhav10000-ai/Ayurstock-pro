'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  SlidersHorizontal,
  Search,
  Plus,
  Minus,
  PackageCheck,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  Filter,
  FileText,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface BatchOption {
  batchId: string;
  medicineId: string;
  medicineName: string;
  company: string;
  batchNumber: string;
  currentStock: number;
  expiryDate: string;
  mrp: number;
}

interface Adjustment {
  id: string;
  medicineId: string;
  medicineName: string;
  batchId: string;
  type: 'ADD' | 'REMOVE';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  notes?: string;
  createdAt: string;
}

const ADD_REASONS = [
  'Purchase Order Received',
  'Return from Customer',
  'Stock Correction',
  'Transfer In',
  'Opening Stock',
  'Other',
];

const REMOVE_REASONS = [
  'Expired / Damaged',
  'Sale (Manual)',
  'Theft / Loss',
  'Transfer Out',
  'Stock Correction',
  'Expired Disposal',
  'Other',
];

export default function StockAdjustmentPage() {
  // Batch search
  const [batchQuery, setBatchQuery] = useState('');
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchOption | null>(null);
  const batchSearchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [adjustType, setAdjustType] = useState<'ADD' | 'REMOVE'>('ADD');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Recent adjustments
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [totalAdjustments, setTotalAdjustments] = useState(0);
  const [filterType, setFilterType] = useState<'ALL' | 'ADD' | 'REMOVE'>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [totalLedgerEntries, setTotalLedgerEntries] = useState(0);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const LEDGER_PAGE_SIZE = 50;

  // Debounced batch search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!batchQuery.trim() || batchQuery.length < 2) {
      setBatchOptions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await axios.get('/api/stock-adjustment/batches', {
          params: { q: batchQuery, limit: 15 },
        });
        if (res.data.success) {
          setBatchOptions(res.data.data);
          setShowBatchDropdown(true);
        }
      } catch {
        console.error('Batch search failed');
      }
    }, 300);
  }, [batchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowBatchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch recent adjustments
  const fetchAdjustments = useCallback(async () => {
    setLoadingAdjustments(true);
    try {
      const params: any = { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
      if (filterType !== 'ALL') params.type = filterType;
      if (searchFilter.trim()) params.search = searchFilter.trim();

      const res = await axios.get('/api/stock-adjustment', { params });
      if (res.data.success) {
        setAdjustments(res.data.data.adjustments);
        setTotalAdjustments(res.data.data.total);
      }
    } catch {
      console.error('Failed to load adjustments');
    } finally {
      setLoadingAdjustments(false);
    }
  }, [filterType, searchFilter, page]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  // Fetch Ledger
  const fetchLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const params: any = { limit: LEDGER_PAGE_SIZE, page: ledgerPage };
      if (ledgerFilter !== 'ALL') params.type = ledgerFilter;
      if (ledgerSearch.trim()) params.search = ledgerSearch.trim();

      const res = await axios.get('/api/stock-ledger', { params });
      if (res.data.success) {
        setLedgerEntries(res.data.data);
        setTotalLedgerEntries(res.data.pagination.total);
      }
    } catch {
      console.error('Failed to load ledger');
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerFilter, ledgerSearch, ledgerPage]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // Reset reason when type changes
  useEffect(() => {
    setReason('');
  }, [adjustType]);

  const reasons = adjustType === 'ADD' ? ADD_REASONS : REMOVE_REASONS;
  const maxQty = adjustType === 'REMOVE' && selectedBatch ? selectedBatch.currentStock : 99999;
  const stockAfter = selectedBatch
    ? adjustType === 'ADD'
      ? selectedBatch.currentStock + quantity
      : selectedBatch.currentStock - quantity
    : null;

  const handleSelectBatch = (batch: BatchOption) => {
    setSelectedBatch(batch);
    setBatchQuery('');
    setShowBatchDropdown(false);
    setBatchOptions([]);
    setQuantity(1);
    setReason('');
    setNotes('');
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleSubmit = async () => {
    if (!selectedBatch) return;
    if (!reason) {
      setErrorMsg('Please select a reason.');
      return;
    }
    if (quantity < 1) {
      setErrorMsg('Quantity must be at least 1.');
      return;
    }
    if (adjustType === 'REMOVE' && quantity > selectedBatch.currentStock) {
      setErrorMsg(`Cannot remove ${quantity} units. Current stock is ${selectedBatch.currentStock}.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await axios.post('/api/stock-adjustment', {
        batchId: selectedBatch.batchId,
        type: adjustType,
        quantity,
        reason,
        notes: notes || null,
      });

      if (res.data.success) {
        const newStock = adjustType === 'ADD'
          ? selectedBatch.currentStock + quantity
          : selectedBatch.currentStock - quantity;

        setSuccessMsg(
          `${adjustType === 'ADD' ? 'Added' : 'Removed'} ${quantity} units. Stock: ${selectedBatch.currentStock} → ${newStock}`
        );

        // Update selected batch's current stock locally
        setSelectedBatch({ ...selectedBatch, currentStock: newStock });
        setQuantity(1);
        setReason('');
        setNotes('');

        // Refresh table
        fetchAdjustments();
        toast.success('Stock adjustment applied successfully');
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Failed to apply adjustment';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(totalAdjustments / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-6 page-enter">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">Logistics</div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Stock Adjustment</h1>
        </div>
      </div>

      <Tabs defaultValue="adjust-stock" className="space-y-6">
        <TabsList className="bg-surface border border-border">
          <TabsTrigger value="adjust-stock" className="text-xs font-black tracking-widest uppercase">Adjust Stock</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs font-black tracking-widest uppercase gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Stock Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="adjust-stock" className="m-0 focus-visible:outline-none focus-visible:ring-0">
      <div className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-6">
        {/* LEFT — Adjust Stock Form */}
        <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden">
          <div className="border-b border-border bg-surface-muted/30 px-6 py-5">
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Adjust Stock</h2>
            <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-wider">Add or remove inventory manually</p>
          </div>

          <div className="p-6 space-y-5">
            {/* Batch Selector */}
            <div ref={dropdownRef} className="relative">
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Select Batch
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={batchSearchRef}
                  type="text"
                  value={batchQuery}
                  onChange={(e) => setBatchQuery(e.target.value)}
                  onFocus={() => batchOptions.length > 0 && setShowBatchDropdown(true)}
                  placeholder="Search medicine or batch number..."
                  className="w-full rounded-xl border-2 border-border bg-background pl-11 pr-4 py-3 text-sm font-bold outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground"
                />
                <ChevronDown className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
              </div>

              {/* Dropdown */}
              {showBatchDropdown && batchOptions.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-auto rounded-xl border border-border bg-surface shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                  {batchOptions.map((batch) => (
                    <button
                      key={batch.batchId}
                      onClick={() => handleSelectBatch(batch)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-muted/50 transition-colors border-b border-surface-muted last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-foreground truncate">{batch.medicineName}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
                          {batch.company} • Batch: {batch.batchNumber}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-sm font-black text-primary">₹{batch.mrp.toFixed(2)}</div>
                        <div className="text-[10px] font-bold text-muted-foreground">Stock: {batch.currentStock}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Batch Info Card */}
            {selectedBatch && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-1">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Selected Batch</span>
                </div>
                <div className="font-black text-foreground text-[15px]">{selectedBatch.medicineName}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  <div>
                    <span className="font-bold text-muted-foreground uppercase tracking-wider">Batch: </span>
                    <span className="font-black text-foreground">{selectedBatch.batchNumber}</span>
                  </div>
                  <div>
                    <span className="font-bold text-muted-foreground uppercase tracking-wider">Stock: </span>
                    <span className="font-black text-foreground">{selectedBatch.currentStock} units</span>
                  </div>
                  <div>
                    <span className="font-bold text-muted-foreground uppercase tracking-wider">Expiry: </span>
                    <span className="font-black text-foreground">
                      {new Date(selectedBatch.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-muted-foreground uppercase tracking-wider">MRP: </span>
                    <span className="font-black text-primary">₹{selectedBatch.mrp.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Type Toggle */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Adjustment Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAdjustType('ADD')}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[11px] font-black tracking-widest uppercase transition-all border shadow-sm ${
                    adjustType === 'ADD'
                      ? 'bg-primary border-primary text-white shadow-primary/20 ring-4 ring-primary/10'
                      : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                  }`}
                >
                  <Plus className="h-4 w-4" />
                  Add Stock
                </button>
                <button
                  onClick={() => setAdjustType('REMOVE')}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[11px] font-black tracking-widest uppercase transition-all border shadow-sm ${
                    adjustType === 'REMOVE'
                      ? 'bg-danger border-danger text-white shadow-danger/20 ring-4 ring-danger/10'
                      : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                  }`}
                >
                  <Minus className="h-4 w-4" />
                  Remove Stock
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-lg font-black outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground"
              />
              {adjustType === 'REMOVE' && selectedBatch && (
                <p className="text-[10px] font-bold text-muted-foreground mt-1.5 uppercase tracking-wider">
                  Max: {selectedBatch.currentStock} units
                </p>
              )}
            </div>

            {/* Live Preview */}
            {selectedBatch && (
              <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${
                adjustType === 'ADD'
                  ? 'bg-primary/5 border-primary/15 text-primary'
                  : 'bg-danger/5 border-danger/15 text-danger'
              }`}>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Stock after adjustment</span>
                <span className="flex items-center gap-2 font-black text-[15px]">
                  {selectedBatch.currentStock}
                  <ArrowRight className="h-4 w-4 opacity-50" />
                  {stockAfter}
                  <span className="text-[10px] font-bold opacity-60 uppercase">units</span>
                </span>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground appearance-none cursor-pointer"
              >
                <option value="">Select a reason...</option>
                {reasons.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-2">
                Notes <span className="text-muted-foreground/40">(Optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Add any additional notes..."
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm font-bold outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground placeholder:text-muted-foreground/30 resize-none"
              />
            </div>

            {/* Feedback */}
            {successMsg && (
              <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-sm font-black text-primary flex items-center gap-2 animate-in fade-in duration-200">
                <PackageCheck className="h-4 w-4 shrink-0" />
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm font-black text-danger flex items-center gap-2 animate-in fade-in duration-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!selectedBatch || !reason || submitting}
              className="w-full rounded-xl bg-primary px-4 py-4 font-black text-sm tracking-[0.2em] text-white uppercase transition-all hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:bg-primary"
            >
              {submitting ? 'Applying...' : 'Apply Adjustment'}
            </button>
          </div>
        </div>

        {/* RIGHT — Recent Adjustments Table */}
        <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden flex flex-col">
          <div className="border-b border-border bg-surface-muted/30 px-6 py-5">
            <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Recent Adjustments</h2>
            <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-wider">
              {totalAdjustments} total adjustment{totalAdjustments !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border bg-background/50">
            <div className="flex items-center rounded-xl border border-border overflow-hidden bg-surface shadow-sm">
              {(['ALL', 'ADD', 'REMOVE'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setFilterType(t); setPage(0); }}
                  className={`px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${
                    filterType === t
                      ? t === 'ADD'
                        ? 'bg-primary text-white'
                        : t === 'REMOVE'
                        ? 'bg-danger text-white'
                        : 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-surface-muted'
                  }`}
                >
                  {t === 'ALL' ? 'All' : t === 'ADD' ? 'Added' : 'Removed'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => { setSearchFilter(e.target.value); setPage(0); }}
                placeholder="Search by medicine name..."
                className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-[11px] font-bold outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/10 text-foreground"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loadingAdjustments ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : adjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted/50 border border-border">
                  <FileText className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <div className="text-sm font-black text-muted-foreground uppercase tracking-wider">No adjustments found</div>
                <p className="text-[11px] font-bold text-muted-foreground/60 max-w-[240px]">
                  Use the form to make your first stock adjustment
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/30">
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Medicine</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Qty</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Before</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">After</th>
                    <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="border-b border-surface-muted hover:bg-surface-muted/30 transition-colors">
                      <td className="px-4 py-3 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                        {new Date(adj.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                        <span className="block text-[9px] text-muted-foreground/60 mt-0.5">
                          {new Date(adj.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] font-black text-foreground max-w-[160px] truncate">{adj.medicineName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                          adj.type === 'ADD'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-danger/10 text-danger border border-danger/20'
                        }`}>
                          {adj.type === 'ADD' ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                          {adj.type === 'ADD' ? 'Added' : 'Removed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-black text-foreground text-right">{adj.quantity}</td>
                      <td className="px-4 py-3 text-[12px] font-bold text-muted-foreground text-right">{adj.stockBefore}</td>
                      <td className="px-4 py-3 text-[12px] font-black text-foreground text-right">{adj.stockAfter}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-muted-foreground max-w-[130px] truncate">{adj.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface-muted/30">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="ledger" className="m-0 focus-visible:outline-none focus-visible:ring-0">
          <div className="rounded-2xl border border-border bg-surface shadow-bento overflow-hidden flex flex-col min-h-[500px]">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-border bg-background/50">
              <div className="flex items-center rounded-xl border border-border overflow-hidden bg-surface shadow-sm">
                {(['ALL', 'IN', 'OUT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setLedgerFilter(t); setLedgerPage(1); }}
                    className={`px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${
                      ledgerFilter === t
                        ? t === 'IN'
                          ? 'bg-primary text-white'
                          : t === 'OUT'
                          ? 'bg-danger text-white'
                          : 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-surface-muted'
                    }`}
                  >
                    {t === 'ALL' ? 'All' : t === 'IN' ? 'In (+)' : 'Out (-)'}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                  placeholder="Search by medicine name..."
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-[11px] font-bold outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/10 text-foreground"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {loadingLedger ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted/50 border border-border">
                    <BookOpen className="h-7 w-7 text-muted-foreground/30" />
                  </div>
                  <div className="text-sm font-black text-muted-foreground uppercase tracking-wider">No stock movements found</div>
                  <p className="text-[11px] font-bold text-muted-foreground/60 max-w-[300px]">
                    All global inventory changes including sales, purchases, and manual updates will be tracked here.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/30">
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">Date & Time</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Medicine</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Batch</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Qty Moved</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground text-right">Running Balance</th>
                      <th className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => {
                      const isAdd = ['PURCHASE', 'ADJUSTMENT_IN', 'RETURN'].includes(entry.type);
                      const isRemove = ['SALE', 'ADJUSTMENT_OUT'].includes(entry.type);
                      
                      let typeBadgeClass = 'bg-surface-muted';
                      if (entry.type === 'SALE') typeBadgeClass = 'bg-danger/10 text-danger border border-danger/20';
                      else if (entry.type === 'PURCHASE') typeBadgeClass = 'bg-primary/10 text-primary border border-primary/20';
                      else if (entry.type === 'RETURN') typeBadgeClass = 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
                      else if (entry.type === 'ADJUSTMENT_IN') typeBadgeClass = 'bg-primary/10 text-primary border border-primary/20';
                      else if (entry.type === 'ADJUSTMENT_OUT') typeBadgeClass = 'bg-danger/10 text-danger border border-danger/20';

                      let referenceRenderer = <span className="text-[11px] font-bold text-muted-foreground">Manual Adjustment</span>;
                      if (entry.type === 'SALE') {
                        referenceRenderer = <Link href={`/dashboard/billing/invoice/${entry.referenceId}`} className="text-[11px] font-bold text-blue-500 hover:underline">View Sale</Link>;
                      } else if (entry.type === 'PURCHASE') {
                        referenceRenderer = <Link href={`/dashboard/purchases/${entry.referenceId}`} className="text-[11px] font-bold text-blue-500 hover:underline">View Purchase</Link>;
                      } else if (entry.type === 'RETURN') {
                        referenceRenderer = <Link href={`/dashboard/returns/${entry.referenceId}`} className="text-[11px] font-bold text-blue-500 hover:underline">View Return</Link>;
                      }

                      return (
                        <tr key={entry.id} className="border-b border-surface-muted hover:bg-surface-muted/30 transition-colors">
                          <td className="px-4 py-4 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            <span className="block text-[9px] text-muted-foreground/60 mt-0.5">
                              {new Date(entry.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-[12px] font-black text-foreground max-w-[200px] truncate">{entry.medicineName}</td>
                          <td className="px-4 py-4 text-[12px] font-bold text-muted-foreground">{entry.batchNumber}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest ${typeBadgeClass}`}>
                              {entry.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className={`px-4 py-4 text-[13px] font-black text-right ${isAdd ? 'text-primary' : 'text-danger'}`}>
                            {isAdd ? '+' : '-'}{entry.quantity}
                          </td>
                          <td className="px-4 py-4 text-[12px] font-black text-foreground text-right">{entry.runningBalance}</td>
                          <td className="px-4 py-4">{referenceRenderer}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination for Ledger */}
            {totalLedgerEntries > LEDGER_PAGE_SIZE && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-muted/30">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                  Page {ledgerPage} of {Math.ceil(totalLedgerEntries / LEDGER_PAGE_SIZE)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                    disabled={ledgerPage === 1}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setLedgerPage((p) => Math.min(Math.ceil(totalLedgerEntries / LEDGER_PAGE_SIZE), p + 1))}
                    disabled={ledgerPage >= Math.ceil(totalLedgerEntries / LEDGER_PAGE_SIZE)}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
