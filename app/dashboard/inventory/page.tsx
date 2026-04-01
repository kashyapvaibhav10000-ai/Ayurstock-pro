'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from 'sonner';
import axios from 'axios';
import {
  AlertTriangle, Pencil, Plus, Trash2, FileDown, FileText, ListOrdered,
  Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight,
  Minus as MinusIcon, Plus as PlusIcon,
  SlidersHorizontal, Columns3, X, Package, CalendarCheck, PartyPopper, CheckCircle2,
  FileSpreadsheet, Printer,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import InventoryEditModal, { EditableInventoryBatch } from '@/components/InventoryEditModal';
import AddInventoryModal from '@/components/AddInventoryModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import ImportPriceList from '@/components/medicine/import-price-list';
import Papa from 'papaparse';

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

// ─── Sort column keys ──────────────────────────────────────────
type SortColumn = 'medicine' | 'batch' | 'expiry' | 'stock' | 'purchaseRate' | 'mrp' | 'packing' | 'rack';
type SortDirection = 'asc' | 'desc';

// ─── SortableHeader component ──────────────────────────────────
function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn | null;
  direction: SortDirection;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const isActive = activeColumn === column;
  return (
    <TableHead
      className={`font-bold uppercase text-[11px] tracking-wider cursor-pointer select-none group transition-colors duration-150 ${
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      } ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </span>
    </TableHead>
  );
}

// ─── Stock indicator dot ───────────────────────────────────────
function StockIndicator({ qty }: { qty: number }) {
  if (qty === 0) return <span className="stock-dot-red mr-1.5" title="Out of stock" />;
  if (qty <= 10) return <span className="stock-dot-amber mr-1.5" title={`Low stock: ${qty}`} />;
  return null;
}

// ─── Critical stock dot (stock < 3) ───────────────────────────
function CriticalDot({ qty }: { qty: number }) {
  if (qty >= 3) return null;
  return (
    <span
      className="critical-dot ml-1.5"
      title={`Critical: Only ${qty} unit(s) left`}
    />
  );
}

// ─── Format currency ──────────────────────────────────────────
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

  // ─── Search state ────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // ─── Sort state ──────────────────────────────────────────────
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // ─── Row expand state ────────────────────────────────────────
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [adjustStock, setAdjustStock] = useState<{ [batchId: string]: number }>({});
  const [adjustingStock, setAdjustingStock] = useState<string | null>(null);

  // ─── Delete confirmation modal ──────────────────────────────
  const [deletingBatch, setDeletingBatch] = useState<InventoryBatch | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Column visibility ─────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    medicine: true,
    batch: true,
    expiry: true,
    stock: true,
    purchaseRate: true,
    mrp: true,
    packing: true,
    rack: true,
    value: false,
    actions: true,
  });

  const visibleColumnCount = useMemo(() => Object.values(visibleColumns).filter(Boolean).length, [visibleColumns]);

  // ─── Filter drawer state ────────────────────────────────────
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterStockMin, setFilterStockMin] = useState('');
  const [filterStockMax, setFilterStockMax] = useState('');
  const [filterExpiryFrom, setFilterExpiryFrom] = useState('');
  const [filterExpiryTo, setFilterExpiryTo] = useState('');
  const [filterRacks, setFilterRacks] = useState<Set<string>>(new Set());

  // ─── Bulk selection state ───────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return col;
      }
      setSortDirection('asc');
      return col;
    });
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
        }
        setExpandedRowId(null);
        setShowFilterDrawer(false);
        setDeletingBatch(null);
        setBulkDeleteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  const rackOptions = useMemo(() => {
    return Array.from(new Set(batches.map((b) => b.rackLocation).filter(Boolean) as string[])).sort();
  }, [batches]);

  // ─── Filtered + Sorted batches ────────────────────────────────
  const filteredBatches = useMemo(() => {
    let result = batches.filter((batch) => {
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

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        batch.medicine.name.toLowerCase().includes(q) ||
        batch.medicine.company.toLowerCase().includes(q) ||
        batch.batchNumber.toLowerCase().includes(q);

      // Advanced filters
      const minStock = filterStockMin !== '' ? Number(filterStockMin) : null;
      const maxStock = filterStockMax !== '' ? Number(filterStockMax) : null;
      const matchesStockRange =
        (minStock === null || batch.stockQty >= minStock) &&
        (maxStock === null || batch.stockQty <= maxStock);

      const expiryDate = new Date(batch.expiryDate);
      const matchesExpiryRange =
        (!filterExpiryFrom || expiryDate >= new Date(filterExpiryFrom)) &&
        (!filterExpiryTo || expiryDate <= new Date(filterExpiryTo));

      const matchesRack =
        filterRacks.size === 0 || filterRacks.has(batch.rackLocation || '');

      return matchesCompany && matchesLowStock && matchesExpiry && matchesSearch && matchesStockRange && matchesExpiryRange && matchesRack;
    });

    // Sort
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (sortColumn) {
          case 'medicine':
            cmp = a.medicine.name.localeCompare(b.medicine.name);
            break;
          case 'batch':
            cmp = a.batchNumber.localeCompare(b.batchNumber);
            break;
          case 'expiry':
            cmp = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            break;
          case 'stock':
            cmp = a.stockQty - b.stockQty;
            break;
          case 'purchaseRate':
            cmp = Number(a.purchaseRate) - Number(b.purchaseRate);
            break;
          case 'mrp':
            cmp = Number(a.mrp) - Number(b.mrp);
            break;
          case 'packing':
            cmp = (a.packing || '').localeCompare(b.packing || '');
            break;
          case 'rack':
            cmp = (a.rackLocation || '').localeCompare(b.rackLocation || '');
            break;
        }
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [batches, companyFilter, showLowStock, expiryFilter, searchQuery, sortColumn, sortDirection, filterStockMin, filterStockMax, filterExpiryFrom, filterExpiryTo, filterRacks]);

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

  // ─── Delete via confirmation modal ──────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingBatch) return;
    setDeleteLoading(true);
    try {
      const response = await axios.delete('/api/inventory/update', {
        params: { id: deletingBatch.id },
      });
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete inventory batch');
      }
      toast.success(response.data.message || 'Inventory batch deleted successfully');
      await loadInventory();
    } catch (error) {
      console.error('Delete inventory batch error:', error);
      toast.error('Failed to delete inventory batch');
    } finally {
      setDeleteLoading(false);
      setDeletingBatch(null);
    }
  };

  // ─── Bulk delete ────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setBulkDeleteLoading(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        axios.delete('/api/inventory/update', { params: { id } })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size} batches deleted successfully`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      await loadInventory();
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Failed to delete some batches');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // ─── Export helpers ─────────────────────────────────────────
  const exportBatchesAsCSV = (batchList: InventoryBatch[], filename: string) => {
    const rows = batchList.map((b) => ({
      'Medicine Name': b.medicine.name,
      'Company': b.medicine.company,
      'Batch': b.batchNumber,
      'Expiry': new Date(b.expiryDate).toLocaleDateString(),
      'Stock': b.stockQty,
      'Purchase Rate': Number(b.purchaseRate).toFixed(2),
      'MRP': Number(b.mrp).toFixed(2),
      'Value': (b.stockQty * Number(b.mrp)).toFixed(2),
      'Packing': b.packing || '',
      'Rack': b.rackLocation || '',
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Reset advanced filters ─────────────────────────────────
  const resetAdvancedFilters = () => {
    setFilterStockMin('');
    setFilterStockMax('');
    setFilterExpiryFrom('');
    setFilterExpiryTo('');
    setFilterRacks(new Set());
  };

  const hasAdvancedFilters = filterStockMin !== '' || filterStockMax !== '' || filterExpiryFrom !== '' || filterExpiryTo !== '' || filterRacks.size > 0;

  // ─── Select all / toggle selection ──────────────────────────
  const allFilteredSelected = filteredBatches.length > 0 && filteredBatches.every((b) => selectedIds.has(b.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBatches.map((b) => b.id)));
    }
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Empty state message ────────────────────────────────────
  const getEmptyState = () => {
    if (showLowStock) {
      return { icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />, message: 'All stock levels are healthy 🎉', sub: 'No items below the low stock threshold.' };
    }
    if (expiryFilter === 'expiring30' || expiryFilter === 'expiring60') {
      return { icon: <CalendarCheck className="h-10 w-10 text-emerald-400" />, message: 'No medicines expiring soon ✅', sub: 'All batches have sufficient shelf life.' };
    }
    if (expiryFilter === 'expired') {
      return { icon: <PartyPopper className="h-10 w-10 text-emerald-400" />, message: 'No expired medicines found 🎊', sub: 'Your inventory is clean and up to date.' };
    }
    return { icon: <Package className="h-10 w-10 text-muted-foreground" />, message: 'No inventory batches found', sub: 'Get started by adding your first inventory batch.' };
  };

  // ─── Row expand toggle ───────────────────────────────────────
  const handleRowClick = useCallback((batchId: string, e: React.MouseEvent) => {
    // Don't toggle if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    setExpandedRowId((prev) => (prev === batchId ? null : batchId));
  }, []);

  // ─── Inline stock adjust ─────────────────────────────────────
  const handleStockAdjust = async (batch: InventoryBatch, delta: number) => {
    const newQty = Math.max(0, batch.stockQty + delta);
    setAdjustingStock(batch.id);
    try {
      await axios.put('/api/inventory/update', {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate.slice(0, 10),
        stockQty: newQty,
        purchaseRate: Number(batch.purchaseRate),
        mrp: Number(batch.mrp),
        rackLocation: batch.rackLocation,
        packing: batch.packing,
      });
      toast.success(`Stock updated: ${batch.stockQty} → ${newQty}`);
      await loadInventory();
    } catch (error) {
      console.error('Stock adjust error:', error);
      toast.error('Failed to adjust stock');
    } finally {
      setAdjustingStock(null);
    }
  };

  const handleStockSet = async (batch: InventoryBatch, newQty: number) => {
    if (newQty < 0 || newQty === batch.stockQty) return;
    setAdjustingStock(batch.id);
    try {
      await axios.put('/api/inventory/update', {
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate.slice(0, 10),
        stockQty: newQty,
        purchaseRate: Number(batch.purchaseRate),
        mrp: Number(batch.mrp),
        rackLocation: batch.rackLocation,
        packing: batch.packing,
      });
      toast.success(`Stock updated: ${batch.stockQty} → ${newQty}`);
      await loadInventory();
    } catch (error) {
      console.error('Stock adjust error:', error);
      toast.error('Failed to adjust stock');
    } finally {
      setAdjustingStock(null);
    }
  };

  if (!isAuthorized) return null;

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading inventory...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track live stock, update batch details, and manage expiry-sensitive inventory.
          </p>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <select
            className="h-10 rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
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
            className="rounded-xl shadow-soft"
          >
            Low Stock
          </Button>
          <Button
            variant={expiryFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setExpiryFilter('all')}
            className="rounded-xl shadow-soft"
          >
            All Expiry
          </Button>
          <Button
            variant="outline"
            className="rounded-xl shadow-soft transition-all hover:shadow-bento hover:border-primary hover:text-primary"
            onClick={() => setShowPriceListModal(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Import Bill
          </Button>
          <Button
            variant="outline"
            className="rounded-xl shadow-soft transition-all hover:shadow-bento hover:border-primary hover:text-primary"
            onClick={() => router.push('/dashboard/inventory/reorder-list')}
          >
            <ListOrdered className="mr-2 h-4 w-4" />
            Reorder List
          </Button>

          {/* ─── Export dropdown ─────────────────────────── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-xl shadow-soft transition-all hover:shadow-bento bg-primary hover:bg-primary-hover text-white font-bold">
                <FileDown className="mr-2 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportBatchesAsCSV(filteredBatches, `inventory-current-${new Date().toISOString().split('T')[0]}.csv`)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Current View (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { window.location.href = '/api/inventory/export'; }}>
                <FileDown className="mr-2 h-4 w-4" />
                Export All (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ─── Filters button ─────────────────────────── */}
          <Button
            variant={hasAdvancedFilters ? 'default' : 'outline'}
            className="rounded-xl shadow-soft"
            onClick={() => setShowFilterDrawer(true)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {hasAdvancedFilters && <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">✓</span>}
          </Button>

          {/* ─── Columns visibility ─────────────────────── */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl shadow-soft">
                <Columns3 className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(['medicine', 'batch', 'expiry', 'stock', 'purchaseRate', 'mrp', 'packing', 'rack', 'value'] as const).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={visibleColumns[key]}
                  onCheckedChange={(checked) => setVisibleColumns((prev) => ({ ...prev, [key]: !!checked }))}
                >
                  {key === 'purchaseRate' ? 'Purchase Rate' : key === 'mrp' ? 'MRP' : key === 'value' ? 'Value (Stock×MRP)' : key.charAt(0).toUpperCase() + key.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Expiry filter pills ─────────────────────────────────── */}
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

      {/* ─── Stats cards ─────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
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
        <Card className="border-danger/20 bg-danger/10 hover:-translate-y-1 transition-all duration-300">
          <CardHeader>
            <CardDescription className="font-bold tracking-wider text-xs uppercase text-danger">Expired</CardDescription>
            <CardTitle className="text-3xl font-extrabold text-danger">{expiryStats.expired}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* ─── Table card ──────────────────────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Inventory Batches</CardTitle>
              <CardDescription>
                Edit batch information, update rack placement, and remove obsolete inventory.
              </CardDescription>
            </div>
            {/* ─── Search bar ──────────────────────────────────── */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                id="inventory-search"
                placeholder="Search medicine, batch, company…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-16 h-10 rounded-xl border-border bg-surface-muted/50 focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Clear search"
                >
                  ×
                </button>
              )}
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-surface-muted text-[10px] text-muted-foreground font-mono">
                ⌘F
              </kbd>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-surface-muted/80 backdrop-blur-sm sticky top-0 z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} /></TableHead>
                    {visibleColumns.medicine && <SortableHeader label="Medicine" column="medicine" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />}
                    {visibleColumns.batch && <SortableHeader label="Batch" column="batch" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />}
                    {visibleColumns.expiry && <SortableHeader label="Expiry" column="expiry" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />}
                    {visibleColumns.stock && <SortableHeader label="Stock" column="stock" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />}
                    {visibleColumns.purchaseRate && <SortableHeader label="Purchase Rate" column="purchaseRate" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="hidden md:table-cell" />}
                    {visibleColumns.mrp && <SortableHeader label="MRP" column="mrp" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />}
                    {visibleColumns.value && <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Value</TableHead>}
                    {visibleColumns.packing && <SortableHeader label="Packing" column="packing" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="hidden md:table-cell" />}
                    {visibleColumns.rack && <SortableHeader label="Rack" column="rack" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="hidden sm:table-cell" />}
                    {visibleColumns.actions && <TableHead className="text-right font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={visibleColumnCount + 1} className="py-16 text-center">
                        {(() => { const es = getEmptyState(); return (
                          <div className="flex flex-col items-center gap-3">
                            {es.icon}
                            <div className="text-base font-semibold text-foreground">{es.message}</div>
                            <div className="text-sm text-muted-foreground">{es.sub}</div>
                            {!showLowStock && expiryFilter === 'all' && (
                              <Button size="sm" className="mt-2" onClick={() => setShowAddInventoryModal(true)}>
                                <Plus className="mr-1.5 h-4 w-4" /> Add Inventory
                              </Button>
                            )}
                          </div>
                        ); })()}
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

                      const isExpanded = expandedRowId === batch.id;
                      const inventoryValue = batch.stockQty * Number(batch.mrp);
                      const isSelected = selectedIds.has(batch.id);

                      return (
                        <>
                          <TableRow
                            key={batch.id}
                            className={`group border-border transition-colors duration-200 cursor-pointer ${rowClassName} ${isExpanded ? 'bg-primary/5' : ''} ${isSelected ? 'ring-1 ring-inset ring-primary/30' : ''}`}
                            onClick={(e) => handleRowClick(batch.id, e)}
                          >
                            <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectOne(batch.id)} />
                            </TableCell>
                            {visibleColumns.medicine && (
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                  <div>
                                    <div className="font-bold text-foreground inline-flex items-center gap-1">
                                      {batch.medicine.name}
                                      <CriticalDot qty={batch.stockQty} />
                                    </div>
                                    <div className="text-xs text-muted-foreground font-medium">{batch.medicine.company}</div>
                                  </div>
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.batch && <TableCell>{batch.batchNumber}</TableCell>}
                            {visibleColumns.expiry && (
                              <TableCell>
                                <div>{new Date(batch.expiryDate).toLocaleDateString()}</div>
                                {daysToExpiry <= 30 ? (
                                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {daysToExpiry < 0 ? 'Expired' : `${daysToExpiry} days left`}
                                  </div>
                                ) : null}
                              </TableCell>
                            )}
                            {visibleColumns.stock && (
                              <TableCell>
                                <div className="inline-flex items-center gap-1">
                                  <StockIndicator qty={batch.stockQty} />
                                  <span className="font-medium">{batch.stockQty}</span>
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.purchaseRate && <TableCell className="hidden md:table-cell">Rs. {Number(batch.purchaseRate).toFixed(2)}</TableCell>}
                            {visibleColumns.mrp && <TableCell>Rs. {Number(batch.mrp).toFixed(2)}</TableCell>}
                            {visibleColumns.value && <TableCell className="font-medium">{formatCurrency(inventoryValue)}</TableCell>}
                            {visibleColumns.packing && <TableCell className="hidden md:table-cell">{batch.packing || '-'}</TableCell>}
                            {visibleColumns.rack && <TableCell className="hidden sm:table-cell">{batch.rackLocation || '-'}</TableCell>}
                            {visibleColumns.actions && (
                              <TableCell>
                                <div className="flex justify-end gap-2 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity duration-150">
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-text-muted hover:text-primary hover:bg-primary/10"
                                    onClick={(e) => { e.stopPropagation(); setEditingBatch(batch); }} title="Edit inventory">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    onClick={(e) => { e.stopPropagation(); setDeletingBatch(batch); }} title="Delete inventory">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${batch.id}-detail`} className="border-border bg-surface-muted/30">
                              <TableCell colSpan={visibleColumnCount + 1} className="py-0 px-0">
                                <div className="row-expand-enter px-6 py-4">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Company</div>
                                      <div className="text-sm font-medium text-foreground">{batch.medicine.company}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Inventory Value</div>
                                      <div className="text-sm font-bold text-foreground">{formatCurrency(inventoryValue)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Days to Expiry</div>
                                      <div className={`text-sm font-bold ${daysToExpiry < 0 ? 'text-danger' : daysToExpiry <= 30 ? 'text-warning-text' : 'text-foreground'}`}>
                                        {daysToExpiry < 0 ? `Expired ${Math.abs(daysToExpiry)} days ago` : `${daysToExpiry} days remaining`}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Adjust Stock</div>
                                      <div className="inline-flex items-center gap-1.5">
                                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg"
                                          onClick={(e) => { e.stopPropagation(); handleStockAdjust(batch, -1); }}
                                          disabled={adjustingStock === batch.id || batch.stockQty === 0}>
                                          <MinusIcon className="h-3.5 w-3.5" />
                                        </Button>
                                        <Input type="number" className="h-7 w-16 text-center text-sm px-1 rounded-lg"
                                          value={adjustStock[batch.id] ?? batch.stockQty}
                                          onChange={(e) => setAdjustStock((prev) => ({ ...prev, [batch.id]: Number(e.target.value) || 0 }))}
                                          onBlur={() => { const val = adjustStock[batch.id]; if (val !== undefined && val !== batch.stockQty) handleStockSet(batch, val); }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') { const val = adjustStock[batch.id]; if (val !== undefined && val !== batch.stockQty) handleStockSet(batch, val); } }}
                                          onClick={(e) => e.stopPropagation()} disabled={adjustingStock === batch.id} />
                                        <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg"
                                          onClick={(e) => { e.stopPropagation(); handleStockAdjust(batch, 1); }}
                                          disabled={adjustingStock === batch.id}>
                                          <PlusIcon className="h-3.5 w-3.5" />
                                        </Button>
                                        {adjustingStock === batch.id && <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-6 right-6 z-20">
        <Button
          size="lg"
          className="h-14 rounded-full px-6 shadow-lg"
          onClick={() => setShowAddInventoryModal(true)}
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Inventory
        </Button>
      </div>

      {/* ─── Floating Bulk Action Bar ───────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 ${
          selectedIds.size > 0 ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto max-w-3xl px-4 pb-6">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface/95 backdrop-blur-lg px-6 py-3 shadow-xl">
            <span className="text-sm font-bold text-foreground">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  const selected = filteredBatches.filter((b) => selectedIds.has(b.id));
                  exportBatchesAsCSV(selected, `inventory-selected-${new Date().toISOString().split('T')[0]}.csv`);
                }}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Export Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  const ids = Array.from(selectedIds).join(',');
                  router.push(`/dashboard/inventory/reorder-list?ids=${ids}`);
                }}
              >
                <ListOrdered className="mr-1.5 h-3.5 w-3.5" />
                Mark for Reorder
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setSelectedIds(new Set())}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Filter Drawer ──────────────────────────────────────── */}
      {showFilterDrawer && (
        <div className="fixed inset-0 z-40" onClick={() => setShowFilterDrawer(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        </div>
      )}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 bg-surface border-l border-border shadow-2xl transition-transform duration-300 ${
          showFilterDrawer ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-bold text-lg text-foreground">Advanced Filters</h3>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowFilterDrawer(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {/* Stock Range */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Stock Range</label>
            <div className="flex items-center gap-2">
              <Input type="number" placeholder="Min" value={filterStockMin} onChange={(e) => setFilterStockMin(e.target.value)} className="h-9 rounded-lg" />
              <span className="text-muted-foreground">–</span>
              <Input type="number" placeholder="Max" value={filterStockMax} onChange={(e) => setFilterStockMax(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>
          {/* Expiry Date Range */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Expiry Date Range</label>
            <div className="space-y-2">
              <Input type="date" value={filterExpiryFrom} onChange={(e) => setFilterExpiryFrom(e.target.value)} className="h-9 rounded-lg" />
              <Input type="date" value={filterExpiryTo} onChange={(e) => setFilterExpiryTo(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>
          {/* Rack Location */}
          {rackOptions.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Rack Location</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {rackOptions.map((rack) => (
                  <label key={rack} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-muted rounded-md px-2 py-1 transition-colors">
                    <Checkbox
                      checked={filterRacks.has(rack)}
                      onCheckedChange={(checked) => {
                        setFilterRacks((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(rack);
                          else next.delete(rack);
                          return next;
                        });
                      }}
                    />
                    {rack}
                  </label>
                ))}
              </div>
            </div>
          )}
          {/* Reset */}
          <Button variant="outline" className="w-full rounded-lg" onClick={resetAdvancedFilters} disabled={!hasAdvancedFilters}>
            Reset All Filters
          </Button>
        </div>
      </div>

      {/* ─── Delete Confirmation Modal ──────────────────────────── */}
      <DeleteConfirmModal
        isOpen={Boolean(deletingBatch)}
        medicineName={deletingBatch?.medicine.name || ''}
        batchNumber={deletingBatch?.batchNumber || ''}
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingBatch(null)}
      />

      {/* ─── Bulk Delete Confirmation Modal ─────────────────────── */}
      <DeleteConfirmModal
        isOpen={bulkDeleteOpen}
        medicineName=""
        batchNumber=""
        bulkCount={selectedIds.size}
        loading={bulkDeleteLoading}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

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
