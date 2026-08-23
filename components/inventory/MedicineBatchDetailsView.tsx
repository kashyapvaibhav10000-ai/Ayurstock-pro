'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Archive, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface Batch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  purchaseRate: number | null;
  sellingRate: number;
  rackLocation: string | null;
  status: 'ACTIVE' | 'ZERO_STOCK';
  isHighlighted: boolean;
  canArchive: boolean;
  lastActivity: {
    date: string;
    daysAgo: number;
  };
}

interface MedicineData {
  medicine: {
    id: string;
    name: string;
    company: string;
    category: string;
    totalActiveStock: number;
  };
  batches: Batch[];
}

interface MedicineBatchDetailsViewProps {
  medicineId: string;
  highlightBatchId: string;
  onBack: () => void;
  onArchiveSuccess: () => void;
}

export default function MedicineBatchDetailsView({
  medicineId,
  highlightBatchId,
  onBack,
  onArchiveSuccess,
}: MedicineBatchDetailsViewProps) {
  const [data, setData] = useState<MedicineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    void fetchMedicineBatches();
  }, [medicineId, highlightBatchId]);

  const fetchMedicineBatches = async () => {
    try {
      setLoading(true);
      // Clear stale data immediately to prevent showing wrong medicine
      setData(null);
      const response = await axios.get(`/api/inventory/medicine-batches/${medicineId}`, {
        params: { highlightBatchId },
      });
      if (response.data.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch medicine batches:', error);
      toast.error('Failed to load medicine batches');
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveClick = (batch: Batch) => {
    setSelectedBatch(batch);
    setShowConfirmDialog(true);
  };

  const handleConfirmArchive = async () => {
    if (!selectedBatch) return;

    try {
      setArchiving(true);
      const response = await axios.post('/api/inventory/archive-batch', {
        batchId: selectedBatch.id,
        reason: `Manual archive of zero-stock batch ${selectedBatch.batchNumber}`,
      });

      if (response.data.success) {
        toast.success('Batch archived successfully');
        setShowConfirmDialog(false);
        setSelectedBatch(null);
        onArchiveSuccess();
      } else {
        throw new Error(response.data.message || 'Failed to archive batch');
      }
    } catch (error: any) {
      console.error('Archive batch error:', error);
      toast.error(error.response?.data?.message || 'Failed to archive batch');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading medicine batches...</div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-semibold text-foreground">Medicine not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" onClick={onBack} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Empty Stock Batches
      </Button>

      {/* Medicine Info Header */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-2">
        <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Medicine Details
        </div>
        <div className="text-2xl font-extrabold text-foreground">{data.medicine.name}</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Company:</span>{' '}
            <span className="font-semibold text-foreground">{data.medicine.company}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Category:</span>{' '}
            <span className="font-semibold text-foreground">{data.medicine.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Active Stock:</span>{' '}
            <span className="font-semibold text-primary">
              {data.medicine.totalActiveStock} units
            </span>
          </div>
        </div>
      </div>

      {/* Batches Table - Desktop */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border">
        <Table>
          <TableHeader className="bg-surface-muted/50 border-b border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                Batch Number
              </TableHead>
              <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                Expiry Date
              </TableHead>
              <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                Stock
              </TableHead>
              <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                MRP
              </TableHead>
              <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                Status
              </TableHead>
              <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.batches.map((batch) => (
              <TableRow
                key={batch.id}
                className={`border-border transition-colors ${
                  batch.isHighlighted
                    ? 'bg-amber-500/10 hover:bg-amber-500/20'
                    : 'hover:bg-primary/5'
                }`}
              >
                <TableCell className="font-bold text-foreground">
                  {batch.isHighlighted && <span className="text-amber-500 mr-2">🔸</span>}
                  {batch.batchNumber}
                  {batch.isHighlighted && (
                    <Badge variant="outline" className="ml-2 text-[10px] border-amber-500 text-amber-600">
                      From List
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(batch.expiryDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  {batch.stockQty}
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  ₹{batch.mrp.toFixed(2)}
                </TableCell>
                <TableCell>
                  {batch.status === 'ZERO_STOCK' ? (
                    <Badge variant="secondary" className="bg-orange-500/20 text-orange-600">
                      Zero Stock
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-primary/20 text-primary">
                      Active
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {batch.canArchive ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2 rounded-xl font-bold"
                      onClick={() => handleArchiveClick(batch)}
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Batches Cards - Mobile */}
      <div className="md:hidden space-y-3">
        {data.batches.map((batch) => (
          <Card
            key={batch.id}
            className={`rounded-2xl border-border shadow-sm ${
              batch.isHighlighted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-surface'
            }`}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-foreground text-base flex items-center gap-2">
                    {batch.isHighlighted && <span className="text-amber-500">🔸</span>}
                    {batch.batchNumber}
                  </div>
                  {batch.isHighlighted && (
                    <Badge variant="outline" className="mt-1 text-[10px] border-amber-500 text-amber-600">
                      From Empty List
                    </Badge>
                  )}
                </div>
                {batch.status === 'ZERO_STOCK' ? (
                  <Badge variant="secondary" className="bg-orange-500/20 text-orange-600">
                    Zero
                  </Badge>
                ) : (
                  <Badge variant="default" className="bg-primary/20 text-primary">
                    Active
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Expiry:</span>{' '}
                  <span className="font-medium">
                    {new Date(batch.expiryDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stock:</span>{' '}
                  <span className="font-semibold">{batch.stockQty}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">MRP:</span>{' '}
                  <span className="font-medium">₹{batch.mrp.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Activity:</span>{' '}
                  <span className="font-medium">{batch.lastActivity.daysAgo}d ago</span>
                </div>
              </div>
              {batch.canArchive && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2 rounded-xl font-bold"
                  onClick={() => handleArchiveClick(batch)}
                >
                  <Archive className="h-4 w-4" />
                  Archive This Batch
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="rounded-3xl border-border bg-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Archive Batch?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              {selectedBatch && (
                <>
                  <div className="rounded-xl bg-surface-muted p-3 space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Medicine:</span>{' '}
                      <span className="font-semibold text-foreground">{data.medicine.name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Company:</span>{' '}
                      <span className="font-semibold text-foreground">{data.medicine.company}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Batch:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {selectedBatch.batchNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expiry:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {new Date(selectedBatch.expiryDate).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Current Stock:</span>{' '}
                      <span className="font-semibold text-orange-600">0</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This will remove this batch from active inventory. Historical purchase, sales,
                    and stock records will remain preserved.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last activity: {selectedBatch.lastActivity.daysAgo} days ago
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmArchive}
              disabled={archiving}
            >
              {archiving ? 'Archiving...' : 'Archive Batch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
