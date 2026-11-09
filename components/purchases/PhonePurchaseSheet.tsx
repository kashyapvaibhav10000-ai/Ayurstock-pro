'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MedicineCombobox, PickerMedicine } from '@/components/purchases/MedicineCombobox';
import { ExpiryField } from '@/components/purchases/ExpiryField';
import { DecimalInput } from '@/components/purchases/DecimalInput';
import {
  BatchHint,
  createEmptyPurchaseItem,
  findBatch,
  MedicineHistory,
  packingSuggestions,
  PurchaseItemForm,
} from '@/components/purchases/types';

interface SupplierOption {
  id: string;
  name: string;
}

interface InvoiceHeader {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
}

interface PhonePurchaseSheetProps {
  open: boolean;
  onClose: () => void;
  header: InvoiceHeader;
  onHeaderChange: (change: Partial<InvoiceHeader>) => void;
  suppliers: SupplierOption[];
  medicines: PickerMedicine[];
  /** Lines already on the invoice (complete ones). */
  items: PurchaseItemForm[];
  onAddItem: (item: PurchaseItemForm) => void;
  onRemoveItem: (tempId: string) => void;
  loadMedicineHistory: (medicineId: string) => Promise<MedicineHistory>;
  /** Opens the "new medicine" dialog for this name; resolves with the created medicine. */
  onCreateMedicine: (name: string) => Promise<PickerMedicine | null>;
  onSave: () => Promise<boolean>;
  saving: boolean;
}

type Field = 'medicine' | 'batch' | 'expiry' | 'quantity' | 'price' | 'mrp' | 'packing';
const ORDER: Field[] = ['medicine', 'batch', 'expiry', 'quantity', 'price', 'mrp', 'packing'];

const fieldClass = 'h-12 w-full rounded-xl text-base';

/**
 * Phone purchase entry: one medicine at a time, like Add Inventory. Fill a
 * line, Add & Next puts it on the invoice and clears the form for the next
 * one; the invoice lines are listed below and saved together.
 */
export function PhonePurchaseSheet({
  open,
  onClose,
  header,
  onHeaderChange,
  suppliers,
  medicines,
  items,
  onAddItem,
  onRemoveItem,
  loadMedicineHistory,
  onCreateMedicine,
  onSave,
  saving,
}: PhonePurchaseSheetProps) {
  const [draft, setDraft] = useState<PurchaseItemForm>(createEmptyPurchaseItem);
  const [batches, setBatches] = useState<BatchHint[]>([]);
  const [creating, setCreating] = useState(false);
  const refs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});

  // Lock the page behind the sheet.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const medicine = draft.medicineId ? medicines.find((m) => m.id === draft.medicineId) : undefined;
  const existingBatch = findBatch(batches, draft.batchNumber);
  const packings = packingSuggestions(medicine, batches);
  const search = draft.medicineSearch?.trim() || '';
  const canCreate =
    Boolean(search) && !draft.medicineId && !medicines.some((m) => m.name.trim().toLowerCase() === search.toLowerCase());
  const total = items.reduce((sum, item) => sum + item.quantity * item.purchaseRate, 0);

  const focus = (field: Field) => setTimeout(() => refs.current[field]?.focus(), 30);
  const next = (field: Field) => {
    const following = ORDER[ORDER.indexOf(field) + 1];
    if (following) focus(following);
    else addAndNext();
  };
  const set = (change: Partial<PurchaseItemForm>) => setDraft((current) => ({ ...current, ...change }));

  const selectMedicine = async (picked: PickerMedicine) => {
    setDraft((current) => ({
      ...current,
      medicineId: picked.id,
      medicineSearch: picked.name,
      packing: current.packing.trim() ? current.packing : picked.packing || '',
    }));
    focus('batch');
    const { last, batches: found } = await loadMedicineHistory(picked.id);
    setBatches(found);
    if (!last) return;
    setDraft((current) =>
      current.medicineId !== picked.id
        ? current
        : {
            ...current,
            mrp: current.mrp > 0 ? current.mrp : Number(last.mrp) || 0,
            packing: current.packing.trim() ? current.packing : last.packing || '',
            rackLocation: current.rackLocation.trim() ? current.rackLocation : last.rackLocation || '',
            purchaseRate: current.purchaseRate > 0 ? current.purchaseRate : Number(last.purchaseRate) || 0,
          }
    );
  };

  const changeBatch = (batchNumber: string) => {
    const existing = findBatch(batches, batchNumber);
    setDraft((current) =>
      existing
        ? {
            ...current,
            batchNumber,
            expiryDate: String(existing.expiryDate).slice(0, 10),
            mrp: Number(existing.mrp) || current.mrp,
            packing: existing.packing || current.packing,
            rackLocation: current.rackLocation.trim() ? current.rackLocation : existing.rackLocation || '',
          }
        : { ...current, batchNumber }
    );
  };

  const createMedicine = async () => {
    setCreating(true);
    try {
      const created = await onCreateMedicine(search);
      if (created) await selectMedicine(created);
    } finally {
      setCreating(false);
    }
  };

  function addAndNext() {
    const missing = !draft.medicineId
      ? 'medicine'
      : !draft.batchNumber.trim()
        ? 'batch'
        : !draft.expiryDate
          ? 'expiry'
          : draft.quantity <= 0
            ? 'quantity'
            : draft.purchaseRate <= 0
              ? 'price'
              : draft.mrp <= 0
                ? 'mrp'
                : null;
    if (missing) {
      const label: Record<string, string> = {
        medicine: 'Pick a medicine', batch: 'Enter the batch number', expiry: 'Enter expiry as MMYY',
        quantity: 'Enter the quantity', price: 'Enter the purchase rate', mrp: 'Enter the MRP',
      };
      toast.error(label[missing]);
      focus(missing as Field);
      return;
    }
    onAddItem({ ...draft, batchNumber: draft.batchNumber.trim().toUpperCase() });
    toast.success(`${draft.medicineSearch} added`);
    // Rack usually stays the same for the next line.
    setDraft({ ...createEmptyPurchaseItem(), rackLocation: draft.rackLocation });
    setBatches([]);
    focus('medicine');
  }

  const editItem = (item: PurchaseItemForm) => {
    onRemoveItem(item.tempId);
    setDraft(item);
    if (item.medicineId) void loadMedicineHistory(item.medicineId).then((history) => setBatches(history.batches));
    focus('medicine');
  };

  const save = async () => {
    if (draft.medicineId) {
      toast.error('Add or clear the medicine you are filling before saving.');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one medicine.');
      return;
    }
    if (await onSave()) {
      setDraft(createEmptyPurchaseItem());
      onClose();
    }
  };

  const enter = (field: Field) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    next(field);
  };

  // Portal: page containers can be transformed, which would trap a fixed
  // element; z-[55] sits above the app bars, below dialogs and the picker list.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add purchase items"
      className="fixed inset-0 z-[55] flex flex-col bg-background md:hidden"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-foreground">Purchase entry</div>
          <div className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? '' : 's'} · ₹{total.toFixed(2)}
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" className="h-11 w-11" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {/* Invoice header */}
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Supplier *</Label>
            <select
              value={header.supplierId}
              onChange={(event) => onHeaderChange({ supplierId: event.target.value })}
              className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-base"
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Invoice no. *</Label>
              <Input
                value={header.invoiceNumber}
                onChange={(event) => onHeaderChange({ invoiceNumber: event.target.value })}
                autoComplete="off"
                autoCapitalize="characters"
                className={fieldClass}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Invoice date</Label>
              <Input
                type="date"
                value={header.invoiceDate}
                onChange={(event) => onHeaderChange({ invoiceDate: event.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        {/* One medicine line */}
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-surface p-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Medicine *</Label>
            <MedicineCombobox
              ref={(node) => {
                refs.current.medicine = node;
              }}
              value={draft.medicineSearch || ''}
              selectedId={draft.medicineId}
              options={medicines}
              className={fieldClass}
              onTextChange={(text) => {
                set({ medicineSearch: text, medicineId: '' });
                setBatches([]);
              }}
              onSelect={(picked) => void selectMedicine(picked)}
              onEnterNext={() => (draft.medicineId ? next('medicine') : undefined)}
            />
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                disabled={creating}
                className="mt-2 h-11 w-full justify-start gap-1.5 rounded-xl border-dashed text-sm text-primary"
                onClick={() => void createMedicine()}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 shrink-0" />}
                <span className="truncate">Add &quot;{search}&quot; as new medicine</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Batch *</Label>
              <Input
                ref={(node) => {
                  refs.current.batch = node;
                }}
                value={draft.batchNumber}
                onChange={(event) => changeBatch(event.target.value)}
                onKeyDown={enter('batch')}
                list={batches.length ? 'phone-batches' : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="next"
                className={fieldClass}
              />
              {batches.length > 0 && (
                <datalist id="phone-batches">
                  {batches.map((batch) => (
                    <option key={`${batch.batchNumber}-${batch.expiryDate}`} value={batch.batchNumber} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Expiry * (MMYY)</Label>
              <ExpiryField
                ref={(node) => {
                  refs.current.expiry = node;
                }}
                value={draft.expiryDate}
                className="h-12 rounded-xl text-base"
                onChange={(iso) => set({ expiryDate: iso })}
                onEnterNext={() => next('expiry')}
              />
            </div>
          </div>
          {existingBatch && (
            <div className="text-xs font-medium text-primary">Adds to existing batch (stock {existingBatch.stockQty})</div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Qty *</Label>
              <Input
                ref={(node) => {
                  refs.current.quantity = node;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft.quantity ? String(draft.quantity) : ''}
                onChange={(event) => set({ quantity: Number(event.target.value.replace(/\D/g, '').slice(0, 7)) || 0 })}
                onKeyDown={enter('quantity')}
                enterKeyHint="next"
                autoComplete="off"
                className={`${fieldClass} text-right`}
              />
            </div>
            <div className="min-w-0" ref={(node) => { refs.current.price = node?.querySelector('input') ?? null; }}>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Rate *</Label>
              <DecimalInput
                value={draft.purchaseRate}
                ariaLabel="Purchase rate"
                className={`${fieldClass} text-right`}
                onKeyDown={enter('price')}
                onChange={(value) => set({ purchaseRate: value })}
              />
            </div>
            <div className="min-w-0" ref={(node) => { refs.current.mrp = node?.querySelector('input') ?? null; }}>
              <Label className="mb-1.5 block text-xs text-muted-foreground">MRP *</Label>
              <DecimalInput
                value={draft.mrp}
                ariaLabel="MRP"
                className={`${fieldClass} text-right`}
                onKeyDown={enter('mrp')}
                onChange={(value) => set({ mrp: value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Packing</Label>
              <Input
                ref={(node) => {
                  refs.current.packing = node;
                }}
                value={draft.packing}
                onChange={(event) => set({ packing: event.target.value })}
                onKeyDown={enter('packing')}
                list={packings.length ? 'phone-packings' : undefined}
                placeholder="e.g. 450 ml"
                maxLength={100}
                autoComplete="off"
                enterKeyHint="done"
                className={fieldClass}
              />
              {packings.length > 0 && (
                <datalist id="phone-packings">
                  {packings.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs text-muted-foreground">Rack</Label>
              <Input
                value={draft.rackLocation}
                onChange={(event) => set({ rackLocation: event.target.value })}
                placeholder="Optional"
                autoComplete="off"
                className={fieldClass}
              />
            </div>
          </div>

          {packings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {packings.slice(0, 6).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => set({ packing: option })}
                  className={`h-9 rounded-full border px-3 text-sm ${
                    draft.packing === option ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <Button
            className="h-12 w-full gap-2 rounded-xl text-base"
            // Keep the keyboard up when tapping it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={addAndNext}
          >
            Add &amp; Next →
          </Button>
        </div>

        {/* Lines on this invoice */}
        {items.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Added ({items.length})</div>
            {items.map((item) => (
              <div key={item.tempId} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{item.medicineSearch}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.batchNumber} · {item.quantity} × ₹{item.purchaseRate}
                    {item.packing ? ` · ${item.packing}` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Edit item" className="h-10 w-10" onClick={() => editItem(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  className="h-10 w-10 text-danger"
                  onClick={() => onRemoveItem(item.tempId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button className="h-12 w-full gap-2 rounded-xl text-base" disabled={saving || items.length === 0} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save Purchase · ₹{total.toFixed(2)}
        </Button>
      </div>
    </div>,
    document.body
  );
}
