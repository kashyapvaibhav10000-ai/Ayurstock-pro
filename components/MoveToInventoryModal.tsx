'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';

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
  quantity: number;
  purchaseRate: number;
  mrp: number;
  rackLocation: string;
}

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
  const [items, setItems] = useState<InventoryItem[]>(
    medicines.map((med) => ({
      medicineId: med.id,
      medicineName: med.name,
      batchNumber: '',
      expiryDate: '',
      quantity: 1,
      purchaseRate: 0,
      mrp: 0,
      rackLocation: '',
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setItems(
      medicines.map((med) => ({
        medicineId: med.id,
        medicineName: med.name,
        batchNumber: '',
        expiryDate: '',
        quantity: 1,
        purchaseRate: 0,
        mrp: 0,
        rackLocation: '',
      }))
    );
    setError('');
  }, [isOpen, medicines]);

  const updateItem = (index: number, field: keyof InventoryItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async () => {
    // Validate all required fields
    for (const item of items) {
      if (!item.batchNumber || !item.expiryDate || !item.mrp || !item.quantity) {
        setError('Please fill all required fields');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        '/api/inventory/move',
        { items }
      );

      if (response.data.success) {
        setError('');
        setItems(
          medicines.map((med) => ({
            medicineId: med.id,
            medicineName: med.name,
            batchNumber: '',
            expiryDate: '',
            quantity: 1,
            purchaseRate: 0,
            mrp: 0,
            rackLocation: '',
          }))
        );
        onClose();
      } else {
        setError(response.data.message || 'Failed to move medicines to inventory');
      }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : 'An error occurred';
      setError(message || 'Failed to move medicines');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Move to Inventory</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {items.map((item, index) => (
            <div
              key={index}
              className="p-4 border rounded-lg bg-gray-50 space-y-3"
            >
              <div className="font-medium text-sm">{item.medicineName}</div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Batch Number *</Label>
                  <Input
                    placeholder="e.g., BATCH001"
                    value={item.batchNumber}
                    onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Expiry Date *</Label>
                  <Input
                    type="date"
                    value={item.expiryDate}
                    onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, 'quantity', parseInt(e.target.value) || 1)
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Purchase Rate (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.purchaseRate}
                    onChange={(e) =>
                      updateItem(index, 'purchaseRate', parseFloat(e.target.value) || 0)
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">MRP (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.mrp}
                    onChange={(e) =>
                      updateItem(index, 'mrp', parseFloat(e.target.value) || 0)
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">Rack Location</Label>
                  <Input
                    placeholder="e.g., A-1-2"
                    value={item.rackLocation}
                    onChange={(e) =>
                      updateItem(index, 'rackLocation', e.target.value)
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? 'Adding...' : 'Add to Inventory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
