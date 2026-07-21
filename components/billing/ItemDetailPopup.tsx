'use client';

/**
 * Item Detail Popup — opens when a cashier manually selects a medicine from
 * Billing_Page search results (click, or Enter on a highlighted suggestion).
 *
 * All displayed data (batch, expiry, MRP, rate, stock, rack, GST, HSN) comes
 * straight from the Medicine + InventoryBatch records returned by
 * /api/billing/search and /api/inventory/batches — nothing here is
 * fabricated. Quantity/GST/Discount edits reuse the exact same GST-mode and
 * discount-mode formulas as the rest of the cart (see Billing_Page).
 *
 * Barcode scanning and the keyboard exact-match flow bypass this popup
 * entirely and add directly to the cart (see Requirement 3) — this popup is
 * only for manual selection.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Loader2, PackageSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CartItem } from '@/types';

const GST_OPTIONS = [
  { value: 5, label: '5%' },
  { value: 12, label: '12%' },
  { value: 18, label: '18%' },
];

export interface ItemDetailSuggestion {
  id: string;
  batchId: string;
  medicineId: string;
  name: string;
  company: string;
  barcode?: string;
  gstPercent: number;
  hsn?: string;
  batchNumber: string;
  stockQty: number;
  mrp: number;
  rate: number;
  purchaseRate: number;
  rackLocation: string;
  expiryDate: string;
}

interface AvailableBatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  purchaseRate: number;
  sellingRate: number;
  rackLocation?: string | null;
  daysToExpiry: number;
}

interface ItemDetailPopupProps {
  isOpen: boolean;
  suggestion: ItemDetailSuggestion | null;
  saleType: 'RETAIL' | 'WHOLESALE' | 'TRANSFER';
  gstMode: 'inclusive' | 'exclusive';
  discountMode: 'flat' | 'percent';
  onDiscountModeChange: (mode: 'flat' | 'percent') => void;
  nearExpiryDays: number;
  lowStockThreshold: number;
  onCancel: () => void;
  onConfirm: (item: CartItem) => void;
}

export default function ItemDetailPopup({
  isOpen,
  suggestion,
  saleType,
  gstMode,
  discountMode,
  onDiscountModeChange,
  nearExpiryDays,
  lowStockThreshold,
  onCancel,
  onConfirm,
}: ItemDetailPopupProps) {
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [gstPercent, setGstPercent] = useState(0);
  const [discountInput, setDiscountInput] = useState(0);

  const [batches, setBatches] = useState<AvailableBatchOption[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // Reset popup state whenever a new suggestion is opened.
  useEffect(() => {
    if (!isOpen || !suggestion) return;
    setQuantity(1);
    setQuantityInput('1');
    setGstPercent(suggestion.gstPercent ?? 0);
    setDiscountInput(0);
    setSelectedBatchId(suggestion.batchId);
    setBatches([]);

    // Requirement 10: fetch all available (non-expired, in-stock) batches for
    // this medicine so the cashier can override FEFO if more than one exists.
    let cancelled = false;
    setLoadingBatches(true);
    axios
      .get('/api/inventory/batches', { params: { medicineId: suggestion.medicineId } })
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success && Array.isArray(res.data.data)) {
          setBatches(res.data.data);
        }
      })
      .catch(() => {
        // Non-fatal: the popup still works with the single suggestion batch.
      })
      .finally(() => {
        if (!cancelled) setLoadingBatches(false);
      });

    // Focus quantity for fast keyboard-driven entry once the popup paints.
    const focusTimer = setTimeout(() => quantityInputRef.current?.focus(), 50);
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
    };
  }, [isOpen, suggestion?.batchId, suggestion?.medicineId]);

  const activeBatch = useMemo(() => {
    if (!suggestion) return null;
    const fromList = batches.find((b) => b.id === selectedBatchId);
    if (fromList) {
      return {
        batchId: fromList.id,
        batchNumber: fromList.batchNumber,
        expiryDate: fromList.expiryDate,
        stockQty: fromList.stockQty,
        mrp: fromList.mrp,
        rate: fromList.sellingRate,
        purchaseRate: fromList.purchaseRate,
        rackLocation: fromList.rackLocation || '',
      };
    }
    // Fall back to the originally selected suggestion until batches load.
    return {
      batchId: suggestion.batchId,
      batchNumber: suggestion.batchNumber,
      expiryDate: suggestion.expiryDate,
      stockQty: suggestion.stockQty,
      mrp: suggestion.mrp,
      rate: suggestion.rate,
      purchaseRate: suggestion.purchaseRate,
      rackLocation: suggestion.rackLocation,
    };
  }, [suggestion, batches, selectedBatchId]);

  const unitPrice = useMemo(() => {
    if (!activeBatch) return 0;
    const purchaseRate = Number(activeBatch.purchaseRate || 0);
    const sellingRate = Number(activeBatch.rate || 0);
    const mrp = Number(activeBatch.mrp || 0);
    if ((saleType === 'WHOLESALE' || saleType === 'TRANSFER') && purchaseRate > 0) {
      return purchaseRate;
    }
    return sellingRate > 0 ? sellingRate : mrp;
  }, [activeBatch, saleType]);

  const daysToExpiry = useMemo(() => {
    if (!activeBatch) return 0;
    return Math.ceil(
      (new Date(activeBatch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
  }, [activeBatch]);

  const isExpired = daysToExpiry < 0;
  const isNearExpiry = !isExpired && daysToExpiry <= nearExpiryDays;
  const isLowStock = !!activeBatch && activeBatch.stockQty <= lowStockThreshold;
  const isOutOfStock = !!activeBatch && activeBatch.stockQty <= 0;
  const exceedsStock = !!activeBatch && quantity > activeBatch.stockQty;

  // Same discount/GST math as Billing_Page's addSuggestionToCart /
  // updateCartItem* functions — Requirements 7.4-7.8.
  const calculation = useMemo(() => {
    const lineTotal = unitPrice * quantity;
    const discountRupees =
      discountMode === 'percent'
        ? Math.round(lineTotal * (discountInput / 100) * 100) / 100
        : discountInput;

    let gst: number;
    let amount: number;

    if (gstMode === 'inclusive') {
      amount = Math.round((lineTotal - discountRupees) * 100) / 100;
      const basePrice = Math.round((amount / (1 + gstPercent / 100)) * 100) / 100;
      gst = Math.round((amount - basePrice) * 100) / 100;
    } else {
      const afterDiscount = Math.round((lineTotal - discountRupees) * 100) / 100;
      gst = Math.round(((afterDiscount * gstPercent) / 100) * 100) / 100;
      amount = Math.round((afterDiscount + gst) * 100) / 100;
    }

    return { discountRupees, gst, amount };
  }, [unitPrice, quantity, discountMode, discountInput, gstMode, gstPercent]);

  const isNegativeAmount = calculation.amount < 0;

  const canConfirm =
    !!activeBatch &&
    !isExpired &&
    !isOutOfStock &&
    !exceedsStock &&
    !isNegativeAmount &&
    quantity >= 1;

  const validationMessage = useMemo(() => {
    if (isExpired) return 'This batch has expired and cannot be billed.';
    if (isOutOfStock) return 'This batch is out of stock.';
    if (exceedsStock && activeBatch) return `Only ${activeBatch.stockQty} unit(s) available.`;
    if (isNegativeAmount) return 'Discount cannot exceed the item value.';
    return '';
  }, [isExpired, isOutOfStock, exceedsStock, activeBatch, isNegativeAmount]);

  const handleQuantityChange = (raw: string) => {
    setQuantityInput(raw);
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      setQuantity(parsed);
    }
  };

  const handleQuantityBlur = () => {
    if (quantity < 1 || isNaN(quantity)) {
      setQuantity(1);
      setQuantityInput('1');
    } else {
      setQuantityInput(String(quantity));
    }
  };

  const handleConfirm = () => {
    if (!canConfirm || !suggestion || !activeBatch) return;
    const item: CartItem = {
      medicineId: suggestion.medicineId,
      medicineName: suggestion.name,
      company: suggestion.company,
      quantity,
      batchId: activeBatch.batchId,
      batchNumber: activeBatch.batchNumber,
      expiryDate: new Date(activeBatch.expiryDate),
      mrp: activeBatch.mrp,
      rate: unitPrice,
      discount: calculation.discountRupees,
      discountPercent: discountMode === 'percent' ? discountInput : 0,
      gstPercent,
      gst: calculation.gst,
      amount: calculation.amount,
      rackLocation: activeBatch.rackLocation,
    };
    onConfirm(item);
  };

  // Requirement 14: Enter confirms, Escape cancels — but not while a select
  // dropdown or the batch table is the active target, to avoid double-firing
  // Enter that a native <select> already handles.
  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement;
      if (target.tagName === 'SELECT') return;
      event.preventDefault();
      if (canConfirm) handleConfirm();
    }
  };

  if (!suggestion) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        onKeyDown={handleDialogKeyDown}
        className="p-0 gap-0 flex flex-col overflow-hidden
          w-screen h-[100dvh] max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0
          sm:w-full sm:max-w-lg sm:h-auto sm:max-h-[85vh] sm:rounded-lg sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]"
      >
        <DialogHeader className="p-4 sm:p-5 border-b border-border shrink-0 text-left">
          <DialogTitle className="text-base sm:text-lg font-bold text-foreground pr-6">
            {suggestion.name}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">{suggestion.company}</p>
        </DialogHeader>

        {/* Scrollable body — keeps confirm/cancel visible per Requirement 6.3 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Badges: near-expiry (Req 11), stock (Req 13) */}
          <div className="flex flex-wrap gap-2">
            {isNearExpiry && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> Near Expiry ({Math.max(daysToExpiry, 0)}d)
              </span>
            )}
            {isExpired && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" /> Expired
              </span>
            )}
            {activeBatch && !isOutOfStock && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${
                  isLowStock
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                    : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                }`}
              >
                <PackageSearch className="h-3 w-3" />
                {isLowStock ? `Only ${activeBatch.stockQty} left` : `${activeBatch.stockQty} in stock`}
              </span>
            )}
          </div>

          {/* Batch picker — Requirement 10 (only shown when >1 batch available) */}
          {loadingBatches ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking other batches…
            </div>
          ) : batches.length > 1 ? (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                Batch (FEFO recommended first)
              </label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {batches.map((b, idx) => {
                  const bDays = Math.ceil(
                    (new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} · Exp {new Date(b.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} · Stock {b.stockQty}
                      {idx === 0 ? ' (recommended)' : ''}
                      {bDays <= nearExpiryDays ? ' ⚠️' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {/* Inventory-sourced detail grid — Requirement 5 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailField label="Batch No." value={activeBatch?.batchNumber || '—'} mono />
            <DetailField
              label="Expiry Date"
              value={activeBatch ? new Date(activeBatch.expiryDate).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : '—'}
            />
            <DetailField label="MRP" value={activeBatch ? `₹${activeBatch.mrp.toFixed(2)}` : '—'} />
            <DetailField label="Selling Rate" value={`₹${unitPrice.toFixed(2)}`} />
            <DetailField label="Rack Location" value={activeBatch?.rackLocation || '—'} />
            <DetailField label="HSN Code" value={suggestion.hsn || '—'} mono />
          </div>

          <hr className="border-border" />

          {/* Editable fields — Requirement 7 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                Quantity
              </label>
              <input
                ref={quantityInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                value={quantityInput}
                onChange={(e) => handleQuantityChange(e.target.value)}
                onBlur={handleQuantityBlur}
                className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-base font-bold text-center focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                GST %
              </label>
              <select
                value={gstPercent}
                onChange={(e) => setGstPercent(parseFloat(e.target.value) || 0)}
                className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm font-bold focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {GST_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Discount
              </label>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => onDiscountModeChange('flat')}
                  className={`px-2.5 py-1 text-[11px] font-bold ${discountMode === 'flat' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground'}`}
                >
                  ₹
                </button>
                <button
                  type="button"
                  onClick={() => onDiscountModeChange('percent')}
                  className={`px-2.5 py-1 text-[11px] font-bold ${discountMode === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground'}`}
                >
                  %
                </button>
              </div>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={discountMode === 'percent' ? 100 : undefined}
              value={discountInput || ''}
              placeholder="0"
              onChange={(e) => setDiscountInput(parseFloat(e.target.value) || 0)}
              className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-base font-bold focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Live subtotal — Requirement 12 */}
          <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-primary">Item Amount</span>
            <span className="text-xl font-black text-primary">₹{calculation.amount.toFixed(2)}</span>
          </div>

          {validationMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 p-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">{validationMessage}</p>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 sm:p-5 border-t border-border shrink-0 flex-row justify-end gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="h-11 flex-1 sm:flex-initial">
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="h-11 flex-1 sm:flex-initial font-bold"
          >
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
