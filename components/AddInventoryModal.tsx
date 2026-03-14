'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
}

interface AddInventoryModalProps {
  isOpen: boolean;
  medicines: MedicineOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function AddInventoryModal({
  isOpen,
  medicines,
  onClose,
  onSaved,
}: AddInventoryModalProps) {
  const [formData, setFormData] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    stockQty: 0,
    purchaseRate: 0,
    mrp: 0,
    rackLocation: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const firstMedicine = medicines[0];
    setFormData({
      medicineId: firstMedicine?.id || '',
      batchNumber: '',
      expiryDate: '',
      stockQty: 0,
      purchaseRate: 0,
      mrp: 0,
      rackLocation: '',
    });
    setError('');
  }, [isOpen, medicines]);

  const handleMedicineChange = (medicineId: string) => {
    setFormData((current) => ({
      ...current,
      medicineId,
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.post('/api/inventory/batches', {
        medicineId: formData.medicineId,
        batchNumber: formData.batchNumber,
        expiryDate: formData.expiryDate,
        stockQty: formData.stockQty,
        mrp: formData.mrp,
        purchaseRate: formData.purchaseRate,
        sellingRate: formData.mrp,
        rackLocation: formData.rackLocation,
      });

      await onSaved();
      onClose();
    } catch (submitError) {
      const message = axios.isAxiosError(submitError)
        ? submitError.response?.data?.message
        : 'Failed to add inventory';
      setError(message || 'Failed to add inventory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Inventory</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="add-inventory-medicine">Medicine</Label>
            <select
              id="add-inventory-medicine"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.medicineId}
              onChange={(e) => handleMedicineChange(e.target.value)}
            >
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.name} - {medicine.company}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-batch-number">Batch Number</Label>
            <Input
              id="add-batch-number"
              value={formData.batchNumber}
              onChange={(e) =>
                setFormData((current) => ({ ...current, batchNumber: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-expiry-date">Expiry Date</Label>
            <Input
              id="add-expiry-date"
              type="date"
              value={formData.expiryDate}
              onChange={(e) =>
                setFormData((current) => ({ ...current, expiryDate: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-stock-qty">Quantity</Label>
              <Input
                id="add-stock-qty"
                type="number"
                value={formData.stockQty}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, stockQty: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-purchase-rate">Purchase Rate</Label>
              <Input
                id="add-purchase-rate"
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
              <Label htmlFor="add-mrp">MRP</Label>
              <Input
                id="add-mrp"
                type="number"
                step="0.01"
                value={formData.mrp}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, mrp: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-rack-location">Rack Location</Label>
              <Input
                id="add-rack-location"
                value={formData.rackLocation}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, rackLocation: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !formData.medicineId}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
