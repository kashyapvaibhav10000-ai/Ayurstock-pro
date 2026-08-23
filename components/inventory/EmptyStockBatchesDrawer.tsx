'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import MedicineBatchDetailsView from './MedicineBatchDetailsView';

interface EmptyBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  purchaseRate: number | null;
  sellingRate: number;
  rackLocation: string | null;
  medicine: {
    id: string;
    name: string;
    company: string;
    category: string;
  };
  lastActivity: {
    date: string;
    daysAgo: number;
  };
}

// Holds exactly which batch the user clicked — batchId is the single source of truth
interface SelectedBatch {
  batchId: string;
}

interface EmptyStockBatchesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onArchiveSuccess: () => void;
}

export default function EmptyStockBatchesDrawer({
  isOpen,
  onClose,
  onArchiveSuccess,
}: EmptyStockBatchesDrawerProps) {
  const [batches, setBatches] = useState<EmptyBatch[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');

  // Use a single object so medicineId + batchId are always set atomically together
  const [selected, setSelected] = useState<SelectedBatch | null>(null);

  const fetchEmptyBatches = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/inventory/empty-stock-batches', {
        params: {
          search,
          company: companyFilter !== 'all' ? companyFilter : undefined,
        },
      });
      if (response.data.success) {
        const data: EmptyBatch[] = response.data.data;
        setBatches(data);
        // Extract unique companies from ALL batches (no filter applied)
        const allCompaniesResponse = await axios.get('/api/inventory/empty-stock-batches', {
          params: {},
        });
        if (allCompaniesResponse.data.success) {
          const allBatches: EmptyBatch[] = allCompaniesResponse.data.data;
          const uniqueCompanies = Array.from(
            new Set(allBatches.map((b) => b.medicine.company))
          ).sort() as string[];
          setCompanies(uniqueCompanies);
        }
      }
    } catch (error) {
      console.error('Failed to fetch empty batches:', error);
      toast.error('Failed to load empty stock batches');
    } finally {
      setLoading(false);
    }
  }, [search, companyFilter]);

  useEffect(() => {
    if (isOpen) {
      void fetchEmptyBatches();
    }
  }, [isOpen, fetchEmptyBatches]);

  // Called when user clicks "View Batches" on a row
  // Only the batchId matters — backend resolves the correct medicine
  const handleViewBatches = (batch: EmptyBatch) => {
    setSelected({ batchId: batch.id });
  };

  const handleBackToList = () => {
    setSelected(null);
    void fetchEmptyBatches();
  };

  const handleArchiveSuccess = () => {
    setSelected(null);
    void fetchEmptyBatches();
    onArchiveSuccess();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-4xl overflow-y-auto"
      >
        {/* ── Detail view ─────────────────────────────────────────── */}
        {selected ? (
          <MedicineBatchDetailsView
            key={selected.batchId}
            batchId={selected.batchId}
            onBack={handleBackToList}
            onArchiveSuccess={handleArchiveSuccess}
          />
        ) : (
          /* ── List view ─────────────────────────────────────────── */
          <>
            <SheetHeader>
              <SheetTitle className="text-2xl font-extrabold">Empty Stock Batches</SheetTitle>
              <SheetDescription className="font-medium">
                Review and manage batches with zero stock
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Search and Company Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search medicine or batch number..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                  />
                </div>
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                >
                  <option value="all">All Companies</option>
                  {companies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>

              {/* Count Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {batches.length} {batches.length === 1 ? 'batch' : 'batches'} found
                </Badge>
              </div>

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading empty stock batches...
                </div>
              ) : batches.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-lg font-semibold text-foreground">No empty stock batches</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    All batches have stock or no batches match your search
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-hidden rounded-2xl border border-border">
                    <Table>
                      <TableHeader className="bg-surface-muted/50 border-b border-border">
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Medicine</TableHead>
                          <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Company</TableHead>
                          <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Batch</TableHead>
                          <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Expiry</TableHead>
                          <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Last Activity</TableHead>
                          <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => (
                          <TableRow key={batch.id} className="hover:bg-primary/5 transition-colors border-border">
                            <TableCell className="font-bold text-foreground">
                              {batch.medicine.name}
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {batch.medicine.category}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {batch.medicine.company}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {batch.batchNumber}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(batch.expiryDate).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {batch.lastActivity.daysAgo} days ago
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 rounded-xl font-bold"
                                onClick={() => handleViewBatches(batch)}
                              >
                                <Eye className="h-4 w-4" />
                                View Batches
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {batches.map((batch) => (
                      <Card key={batch.id} className="rounded-2xl border-border bg-surface shadow-sm">
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <div className="font-bold text-foreground text-base">
                              {batch.medicine.name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {batch.medicine.company} • {batch.medicine.category}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Batch:</span>{' '}
                              <span className="font-medium">{batch.batchNumber}</span>
                            </div>
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
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last activity: {batch.lastActivity.daysAgo} days ago
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 rounded-xl font-bold"
                            onClick={() => handleViewBatches(batch)}
                          >
                            <Eye className="h-4 w-4" />
                            View All Batches
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
