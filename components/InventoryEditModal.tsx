'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface EditableInventoryBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  purchaseRate: number;
  mrp: number;
  packing?: string | null;
  rackLocation?: string | null;
  gstPercent: number;
  medicine: {
    name: string;
  };
}

const GST_OPTIONS = [
  { value: 5, label: '5%', category: 'Standard' },
  { value: 12, label: '12%', category: 'Proprietary' },
  { value: 18, label: '18%', category: 'Cosmetic' },
];

interface InventoryEditModalProps {
  isOpen: boolean;
  batch: EditableInventoryBatch | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function InventoryEditModal({
  isOpen,
  batch,
  onClose,
  onSaved,
}: InventoryEditModalProps) {
  const [formData, setFormData] = useState({
    id: '',
    batchNumber: '',
    expiryDate: '',
    stockQty: 0,
    purchaseRate: 0,
    mrp: 0,
    packing: '',
    rackLocation: '',
    gstPercent: 5,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batch) {
      return;
    }

    setFormData({
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate.slice(0, 10),
      stockQty: batch.stockQty,
      purchaseRate: Number(batch.purchaseRate),
      mrp: Number(batch.mrp),
      packing: batch.packing || '',
      rackLocation: batch.rackLocation || '',
      gstPercent: batch.gstPercent || 5,
    });
    setError('');
  }, [batch]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.put('/api/inventory/update', {
        ...formData,
        purchaseRate: formData.purchaseRate || null,
        gstPercent: formData.gstPercent,
      });
      await onSaved();
      onClose();
    } catch (submitError) {
      const message = axios.isAxiosError(submitError)
        ? submitError.response?.data?.message
        : 'Failed to update inventory';
      setError(message || 'Failed to update inventory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Inventory</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            {batch?.medicine.name}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inventory-batch-number">Batch Number</Label>
            <Input
              id="inventory-batch-number"
              value={formData.batchNumber}
              onChange={(e) => setFormData((current) => ({ ...current, batchNumber: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inventory-expiry-date">Expiry Date</Label>
            <Input
              id="inventory-expiry-date"
              type="date"
              value={formData.expiryDate}
              onChange={(e) => setFormData((current) => ({ ...current, expiryDate: e.target.value }))}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inventory-stock">Stock Quantity</Label>
              <Input
                id="inventory-stock"
                type="number"
                value={formData.stockQty}
                onChange={(e) =>
                  setFormData((current) => ({
                    ...current,
                    stockQty: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inventory-purchase-rate">Purchase Rate</Label>
              <Input
                id="inventory-purchase-rate"
                type="number"
                step="0.01"
                value={formData.purchaseRate}
                onChange={(e) =>
                  setFormData((current) => ({
                    ...current,
                    purchaseRate: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inventory-mrp">MRP</Label>
              <Input
                id="inventory-mrp"
                type="number"
                step="0.01"
                value={formData.mrp}
                onChange={(e) =>
                  setFormData((current) => ({
                    ...current,
                    mrp: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inventory-packing">Packing</Label>
              <Input
                id="inventory-packing"
                placeholder="e.g. 10x10 Strips, 100ml"
                value={formData.packing}
                onChange={(e) =>
                  setFormData((current) => ({
                    ...current,
                    packing: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inventory-rack-location">Rack Location</Label>
              <Input
                id="inventory-rack-location"
                value={formData.rackLocation}
                onChange={(e) =>
                  setFormData((current) => ({
                    ...current,
                    rackLocation: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>GST Rate *</Label>
            <div className="flex gap-2">
              {GST_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setFormData((current) => ({ ...current, gstPercent: opt.value }))
                  }
                  className={`flex-1 flex flex-col items-center justify-center rounded-md border p-2 transition-all ${
                    formData.gstPercent === opt.value
                      ? 'bg-primary border-primary text-white'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="text-sm font-bold">{opt.label}</span>
                  <span className="text-[10px] opacity-80 font-normal">{opt.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
