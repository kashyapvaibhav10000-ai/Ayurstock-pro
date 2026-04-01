'use client';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  medicineName: string;
  batchNumber: string;
  /** Optional: pass count > 1 for bulk delete */
  bulkCount?: number;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  isOpen,
  medicineName,
  batchNumber,
  bulkCount,
  loading = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const isBulk = bulkCount && bulkCount > 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <DialogTitle className="text-center">
            {isBulk ? `Delete ${bulkCount} Batches?` : 'Delete Inventory Batch?'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isBulk ? (
              <>You are about to permanently delete <strong>{bulkCount} selected batches</strong>. This action cannot be undone.</>
            ) : (
              <>
                You are about to delete batch <strong className="text-foreground">{batchNumber}</strong> for{' '}
                <strong className="text-foreground">{medicineName}</strong>. This action cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 sm:justify-center gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="min-w-[100px]">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="min-w-[100px] bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? 'Deleting…' : isBulk ? `Delete ${bulkCount} Batches` : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
