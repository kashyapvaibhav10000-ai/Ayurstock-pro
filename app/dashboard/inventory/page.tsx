'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from 'sonner';
import axios from 'axios';
import { AlertTriangle, Pencil, Plus, Trash2, FileDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import InventoryEditModal, { EditableInventoryBatch } from '@/components/InventoryEditModal';
import AddInventoryModal from '@/components/AddInventoryModal';
import ImportPriceList from '@/components/medicine/import-price-list';

interface InventoryBatch extends EditableInventoryBatch {
  sellingRate: number;
  rackLocation?: string | null;
  medicine: {
    id: string;
    name: string;
    company: string;
    category: string;
    barcode?: string;
    hsn: string;
  };
}

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
}
export default function InventoryPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expiring30' | 'expiring60' | 'expired'>(
    'all'
  );
  const [editingBatch, setEditingBatch] = useState<EditableInventoryBatch | null>(null);
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);
  const [showPriceListModal, setShowPriceListModal] = useState(false);

  useEffect(() => {
    if (isAuthorized) {
      void loadInventory();
      void loadMedicines();
    }
  }, [isAuthorized]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/inventory/batches', {
        params: { limit: 200 },
      });

      if (response.data.success) {
        setBatches(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMedicines = async () => {
    try {
      const response = await axios.get('/api/medicines/search', {
        params: { query: '', limit: 200 },
      });

      if (response.data.success) {
        setMedicines(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load medicines for inventory modal:', error);
    }
  };

  const companyOptions = useMemo(() => {
    return Array.from(new Set(batches.map((batch) => batch.medicine.company))).sort();
  }, [batches]);

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const matchesCompany =
        companyFilter === 'all' || batch.medicine.company === companyFilter;
      const daysToExpiry = Math.ceil(
        (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const matchesLowStock = !showLowStock || batch.stockQty <= 10;
      const matchesExpiry =
        expiryFilter === 'all' ||
        (expiryFilter === 'expired' && daysToExpiry < 0) ||
        (expiryFilter === 'expiring30' && daysToExpiry >= 0 && daysToExpiry <= 30) ||
        (expiryFilter === 'expiring60' && daysToExpiry >= 0 && daysToExpiry <= 60);

      return matchesCompany && matchesLowStock && matchesExpiry;
    });
  }, [batches, companyFilter, showLowStock, expiryFilter]);

  const expiryStats = useMemo(() => {
    let expired = 0;
    let expiring30 = 0;
    let expiring60 = 0;

    batches.forEach((batch) => {
      const daysToExpiry = Math.ceil(
        (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysToExpiry < 0) {
        expired += 1;
      } else if (daysToExpiry <= 30) {
        expiring30 += 1;
        expiring60 += 1;
      } else if (daysToExpiry <= 60) {
        expiring60 += 1;
      }
    });

    return { expired, expiring30, expiring60 };
  }, [batches]);

  const handleDeleteBatch = async (batch: InventoryBatch) => {
    const confirmed = window.confirm(`Delete batch ${batch.batchNumber} for ${batch.medicine.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await axios.delete('/api/inventory/update', {
        params: { id: batch.id },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete inventory batch');
      }

      toast.success(response.data.message || 'Inventory batch deleted successfully');
      await loadInventory();
    } catch (error) {
      console.error('Delete inventory batch error:', error);
      toast.error('Failed to delete inventory batch');
    }
  };

  if (!isAuthorized) return null;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading inventory...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">Inventory</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track live stock, update batch details, and manage expiry-sensitive inventory.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="all">All Companies</option>
            {companyOptions.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
          <Button
            variant={showLowStock ? 'default' : 'outline'}
            onClick={() => setShowLowStock((current) => !current)}
          >
            Low Stock
          </Button>
          <Button
            variant={expiryFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setExpiryFilter('all')}
          >
            All Expiry
          </Button>
          <Button
            variant="outline"
            className="rounded-xl shadow-soft transition-all hover:shadow-bento hover:border-primary hover:text-primary"
            onClick={() => setShowPriceListModal(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Import Price List
          </Button>
          <Button
            onClick={() => { window.location.href = '/api/inventory/export'; }}
            className="rounded-xl shadow-soft transition-all hover:shadow-bento bg-primary hover:bg-primary-hover text-white font-bold"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Download Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={expiryFilter === 'expiring30' ? 'default' : 'outline'}
          onClick={() => setExpiryFilter('expiring30')}
          size="sm"
          className="rounded-lg shadow-sm"
        >
          Expiring in 30 days
        </Button>
        <Button
          variant={expiryFilter === 'expiring60' ? 'default' : 'outline'}
          onClick={() => setExpiryFilter('expiring60')}
          size="sm"
          className="rounded-lg shadow-sm"
        >
          Expiring in 60 days
        </Button>
        <Button
          variant={expiryFilter === 'expired' ? 'default' : 'outline'}
          onClick={() => setExpiryFilter('expired')}
          size="sm"
          className="rounded-lg shadow-sm"
        >
          Expired
        </Button>
      </div>



      <div className="grid gap-4 md:grid-cols-5">
        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase">Total Batches</CardDescription>
            <CardTitle className="text-3xl font-extrabold">{batches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase">Low Stock</CardDescription>
            <CardTitle className="text-3xl font-extrabold text-warning-text">{batches.filter((batch) => batch.stockQty <= 10).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase">Near Expiry (30)</CardDescription>
            <CardTitle className="text-3xl font-extrabold text-warning-text">{expiryStats.expiring30}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase">Expiring (60)</CardDescription>
            <CardTitle className="text-3xl font-extrabold">{expiryStats.expiring60}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-danger/30 bg-danger-bg hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase text-danger-text">Expired</CardDescription>
            <CardTitle className="text-3xl font-extrabold text-danger">{expiryStats.expired}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Inventory Batches</CardTitle>
          <CardDescription>
            Edit batch information, update rack placement, and remove obsolete inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <Table>
              <TableHeader className="bg-surface-muted/50">
                <TableRow>
                  <TableHead className="font-bold text-text-secondary">Medicine</TableHead>
                  <TableHead className="font-bold text-text-secondary">Batch</TableHead>
                  <TableHead className="font-bold text-text-secondary">Expiry</TableHead>
                  <TableHead className="font-bold text-text-secondary">Stock</TableHead>
                  <TableHead className="font-bold text-text-secondary">MRP</TableHead>
                  <TableHead className="font-bold text-text-secondary">Rack</TableHead>
                  <TableHead className="text-right font-bold text-text-secondary">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No inventory batches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBatches.map((batch) => {
                    const daysToExpiry = Math.ceil(
                      (new Date(batch.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    );
                    const rowClassName =
                      daysToExpiry < 0
                        ? 'bg-red-50'
                        : daysToExpiry <= 30
                          ? 'bg-amber-50 hover:bg-amber-100/60'
                          : daysToExpiry <= 60
                            ? 'bg-yellow-50 hover:bg-yellow-100/60'
                          : 'hover:bg-gray-50';

                    return (
                      <TableRow key={batch.id} className={rowClassName}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{batch.medicine.name}</div>
                          <div className="text-xs text-slate-500">{batch.medicine.company}</div>
                        </TableCell>
                        <TableCell>{batch.batchNumber}</TableCell>
                        <TableCell>
                          <div>{new Date(batch.expiryDate).toLocaleDateString()}</div>
                          {daysToExpiry <= 30 ? (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {daysToExpiry < 0 ? 'Expired' : `${daysToExpiry} days left`}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{batch.stockQty}</TableCell>
                        <TableCell>Rs. {Number(batch.mrp).toFixed(2)}</TableCell>
                        <TableCell>{batch.rackLocation || '-'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setEditingBatch(batch)}
                              title="Edit inventory"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleDeleteBatch(batch)}
                              title="Delete inventory"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-6 right-6">
        <Button
          size="lg"
          className="h-14 rounded-full px-6 shadow-lg"
          onClick={() => setShowAddInventoryModal(true)}
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Inventory
        </Button>
      </div>

      <InventoryEditModal
        isOpen={Boolean(editingBatch)}
        batch={editingBatch}
        onClose={() => setEditingBatch(null)}
        onSaved={async () => {
          toast.success('Inventory batch updated successfully');
          await loadInventory();
          await loadMedicines();
        }}
      />

      <AddInventoryModal
        isOpen={showAddInventoryModal}
        medicines={medicines}
        onClose={() => setShowAddInventoryModal(false)}
        onSaved={async () => {
          toast.success('Inventory added successfully');
          await loadInventory();
          await loadMedicines();
        }}
      />

      <ImportPriceList
        isOpen={showPriceListModal}
        onClose={() => setShowPriceListModal(false)}
        onSuccess={async (count) => {
          toast.success(`${count} medicines imported — go to Medicine Master to move them into Inventory`);
          await loadMedicines();
        }}
      />
    </div>
  );
}
