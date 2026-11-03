'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { AvailableBatch } from '@/services/inventory';

import { batchLabel } from '@/lib/batch';
interface BatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: AvailableBatch[];
  selectedId: string | null;
  onSelect: (batch: AvailableBatch) => void;
}

export default function BatchSelectionModal({ isOpen, onClose, batches, selectedId, onSelect }: BatchSelectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Batch</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto max-h-96">
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
              {batches.map((batch) => {
                const days = Math.ceil((new Date(batch.expiryDate).getTime() - new Date().getTime())/(1000*60*60*24));
                return (
                  <TableRow key={batch.id} className={`${batch.id === selectedId ? 'bg-blue-50' : ''} hover:bg-surface-muted cursor-pointer`} onClick={() => onSelect(batch)}>
                    <TableCell>{batchLabel(batch, batch.stockQty)}{batch.id === selectedId && ' (recommended)'}</TableCell>
                    <TableCell>{new Date(batch.expiryDate).toLocaleDateString()} {days<0? '(expired)': days<=30?`(${days}d)`:''}</TableCell>
                    <TableCell>{batch.stockQty}</TableCell>
                    <TableCell>₹{batch.mrp.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
