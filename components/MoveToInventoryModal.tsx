'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { CheckCircle, SkipForward } from 'lucide-react';

interface Medicine {
  id: string;
  name: string;
  company: string;
  category: string;
}

interface InventoryItem {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number | string;
  purchaseRate: number | string;
  mrp: number | string;
  packing: string;
  gstPercent: number;
  rackLocation: string;
}

const PACKAGING_OPTIONS: Record<string, string[]> = {
  Tablet: ['10 Tab', '20 Tab', '30 Tab', '40 Tab', '60 Tab', '80 Tab', '100 Tab'],
  Capsule: ['10 Cap', '20 Cap', '30 Cap', '60 Cap'],
  Powder: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Churna: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Asav: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Syrup: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Oil: ['50 ml', '100 ml', '200 ml', '500 ml'],
  Cream: ['15 gm', '30 gm', '50 gm'],
  Gel: ['15 gm', '30 gm', '50 gm'],
  Drops: ['10 ml', '15 ml', '30 ml'],
  Bhasma: ['10 gm', '25 gm', '50 gm'],
  Vati: ['10 Tab', '20 Tab', '30 Tab', '60 Tab'],
  Chawanprash: ['250 gm', '500 gm', '1 kg'],
  Other: [],
};

const GST_OPTIONS = [
  { value: 0, label: '0%' },
  { value: 5, label: '5%' },
  { value: 12, label: '12%' },
  { value: 18, label: '18%' },
];

const emptyItem = (med: Medicine): InventoryItem => ({
  medicineId: med.id,
  medicineName: med.name,
  batchNumber: '',
  expiryDate: '',
  quantity: '',
  purchaseRate: '',
  mrp: '',
  packing: '',
  gstPercent: 5,
  rackLocation: '',
});

interface MoveToInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
}

export default function MoveToInventoryModal({
  isOpen,
  onClose,
  medicines,
}: MoveToInventoryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(0);
    setAddedCount(0);
    setSkippedCount(0);
    setDone(false);
    setError('');
    setItems(medicines.map(emptyItem));
  }, [isOpen, medicines]);

  const current = items[currentIndex];

  const updateField = (field: keyof InventoryItem, value: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], [field]: value };
      return next;
    });
    setError('');
  };

  const canAdd =
    current &&
    current.batchNumber.trim() !== '' &&
    current.expiryDate !== '' &&
    current.quantity !== '' &&
    current.mrp !== '' &&
    Number(current.quantity) > 0 &&
    Number(current.mrp) > 0;

  const advance = () => {
    const next = currentIndex + 1;
    if (next >= medicines.length) {
      setDone(true);
    } else {
      setCurrentIndex(next);
      setError('');
    }
  };

  const handleSkip = () => {
    setSkippedCount((c) => c + 1);
    advance();
  };

  const handleAdd = async () => {
    if (!canAdd || !current) return;

    setLoading(true);
    setError('');

    try {
      const payload = {
        items: [{
          ...current,
          quantity: Number(current.quantity),
          purchaseRate: current.purchaseRate === '' ? undefined : Number(current.purchaseRate),
          mrp: Number(current.mrp),
        }],
      };

      const response = await axios.post('/api/inventory/move', payload);

      if (response.data.success) {
        setAddedCount((c) => c + 1);
        advance();
      } else {
        setError(response.data.message || 'Failed to add to inventory');
      }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : 'An error occurred';
      setError(message || 'Failed to move medicine');
    } finally {
      setLoading(false);
    }
  };

  const total = medicines.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Move to Inventory</DialogTitle>
        </DialogHeader>

        {done ? (
          /* Summary screen */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <div>
              <p className="text-lg font-semibold text-slate-900">All done!</p>
              <p className="mt-1 text-sm text-slate-500">
                {addedCount} added to inventory &middot; {skippedCount} skipped
              </p>
            </div>
            <Button onClick={onClose} className="mt-2">Close</Button>
          </div>
        ) : current ? (
          <>
            {/* Progress indicator */}
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Medicine {currentIndex + 1} of {total}</span>
              <span>{addedCount} added &middot; {skippedCount} skipped</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${((currentIndex) / total) * 100}%` }}
              />
            </div>

            <div className="rounded-lg border bg-slate-50 p-4 mb-4">
              <p className="font-semibold text-slate-900">{current.medicineName}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {medicines[currentIndex]?.company} &middot; {medicines[currentIndex]?.category}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-2">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Batch Number *</Label>
                <Input
                  placeholder="e.g., BATCH001"
                  value={current.batchNumber}
                  onChange={(e) => updateField('batchNumber', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Expiry Date *</Label>
                <Input
                  type="date"
                  value={current.expiryDate}
                  onChange={(e) => updateField('expiryDate', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={current.quantity}
                  onChange={(e) => updateField('quantity', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Purchase Rate (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Rate"
                  value={current.purchaseRate}
                  onChange={(e) => updateField('purchaseRate', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">MRP (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="MRP"
                  value={current.mrp}
                  onChange={(e) => updateField('mrp', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Packing</Label>
                <Input
                  className="mt-1 flex h-9 w-full text-sm"
                  placeholder="e.g. 10x10 Strips, 100ml"
                  list="move-packing-options"
                  value={current.packing}
                  onChange={(e) => updateField('packing', e.target.value)}
                />
                <datalist id="move-packing-options">
                  {((PACKAGING_OPTIONS[medicines[currentIndex]?.category || ''] || PACKAGING_OPTIONS[(medicines[currentIndex]?.category || '').charAt(0).toUpperCase() + (medicines[currentIndex]?.category || '').slice(1).toLowerCase()]) || []).map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">GST Content (%)</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={current.gstPercent}
                  onChange={(e) => updateField('gstPercent' as any, e.target.value)}
                >
                  {GST_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Rack Location</Label>
                <Input
                  placeholder="e.g., A-1-2"
                  value={current.rackLocation}
                  onChange={(e) => updateField('rackLocation', e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>

            <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkip}
                disabled={loading}
                className="gap-1 text-slate-600 w-full sm:w-auto"
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
              <Button
                onClick={handleAdd}
                disabled={!canAdd || loading}
                className="bg-green-600 hover:bg-green-700 gap-1 w-full sm:w-auto"
              >
                {loading ? 'Adding...' : 'Add to Inventory'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
