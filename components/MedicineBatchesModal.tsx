'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface BatchRow {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
}

interface MedicineBatchesModalProps {
  isOpen: boolean;
  medicineId: string | null;
  medicineName: string;
  onClose: () => void;
}

export default function MedicineBatchesModal({
  isOpen,
  medicineId,
  medicineName,
  onClose,
}: MedicineBatchesModalProps) {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !medicineId) {
      return;
    }

    const loadBatches = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/inventory/batches', {
          params: { medicineId },
        });

        if (response.data.success) {
          setBatches(response.data.data);
        }
      } catch (error) {
        console.error('Failed to load medicine batches:', error);
        setBatches([]);
      } finally {
        setLoading(false);
      }
    };

    loadBatches();
  }, [isOpen, medicineId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>View Batches: {medicineName}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>MRP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-gray-500">
                    Loading batches...
                  </TableCell>
                </TableRow>
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-gray-500">
                    No batches found for this medicine.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                    <TableCell>{new Date(batch.expiryDate).toLocaleDateString()}</TableCell>
                    <TableCell>{batch.stockQty}</TableCell>
                    <TableCell>Rs. {Number(batch.mrp).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
