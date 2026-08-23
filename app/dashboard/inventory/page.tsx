'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from 'sonner';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  ListOrdered,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Clock,
  CalendarClock,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import InventoryEditModal, { EditableInventoryBatch } from '@/components/InventoryEditModal';
import AddInventoryModal from '@/components/AddInventoryModal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

interface CompanyOption {
  id: string;
  name: string;
}

interface InventoryStats {
  total: number;
  lowStock: number;
  expiring30: number;
  expiring60: number;
  expired: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type TabKey = 'all' | 'lowStock' | 'expiring30' | 'expiring60' | 'expired';

function daysUntilExpiry(expiryDate: string): number {
  return Math.ceil(
    (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InventoryPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) router.replace('/dashboard');
  }, [isAuthorized, router]);

  /* ---- state (data) ---- */
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<InventoryStats>({
    total: 0,
    lowStock: 0,
    expiring30: 0,
    expiring60: 0,
    expired: 0,
  });

  /* ---- state (UI) ---- */
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortByExpiry, setSortByExpiry] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBatches, setArchivedBatches] = useState<InventoryBatch[]>([]);

  /* ---- state (modals — unchanged) ---- */
  const [editingBatch, setEditingBatch] = useState<EditableInventoryBatch | null>(null);
  const [showAddInventoryModal, setShowAddInventoryModal] = useState(false);

  const ROWS_PER_PAGE = 15;

  /* ---- data fetchers ----
   * Filtering (search / company / tab) and pagination now happen on the
   * server via /api/inventory/batches query params, instead of pulling up
   * to 5000 rows into the browser and filtering them with JS on every
   * keystroke. Stat card counts come from the same request (includeStats)
   * so they always reflect the true totals, not just what's on this page.
   */
  useEffect(() => {
    if (isAuthorized) {
      void loadCompanies();
      void loadMedicines();
    }
  }, [isAuthorized]);

  // Debounce search input so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Archived view fetches its (typically small) full list once per toggle,
  // then filters/paginates it client-side — no search/company/tab params to
  // send server-side, so it does NOT need to refetch on every page click.
  useEffect(() => {
    if (isAuthorized && showArchived) {
      void loadArchivedInventory();
    }
  }, [isAuthorized, showArchived]);

  // Archived view filters client-side, but should still reset to page 1
  // whenever a filter changes (matches the active view's behavior).
  useEffect(() => {
    if (showArchived) setCurrentPage(1);
  }, [showArchived, activeTab, companyFilter, debouncedSearch]);

  // Active view: search/company/tab filtering happens server-side, so any
  // change to those — or to the page number — needs a fresh request. When a
  // filter (not the page) changes while we're past page 1, reset to page 1
  // and let that state change re-trigger this same effect, rather than
  // firing one request for the stale page and a second corrective one.
  const activeFiltersKey = `${activeTab}|${companyFilter}|${debouncedSearch}`;
  const prevActiveFiltersKeyRef = useRef(activeFiltersKey);

  useEffect(() => {
    if (!isAuthorized || showArchived) return;
    const filtersChanged = prevActiveFiltersKeyRef.current !== activeFiltersKey;
    prevActiveFiltersKeyRef.current = activeFiltersKey;

    if (filtersChanged && currentPage !== 1) {
      setCurrentPage(1); // triggers this same effect again with page reset
      return;
    }

    void loadActiveInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, showArchived, activeFiltersKey, currentPage]);

  const loadArchivedInventory = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/inventory/archived');
      if (response.data.success) {
        setArchivedBatches(response.data.data);
        setTotalCount(response.data.data.length);
      }
    } catch (error) {
      console.error('Failed to load archived inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveInventory = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/inventory/batches', {
        params: {
          limit: ROWS_PER_PAGE,
          offset: (currentPage - 1) * ROWS_PER_PAGE,
          search: debouncedSearch || undefined,
          company: companyFilter !== 'all' ? companyFilter : undefined,
          tab: activeTab !== 'all' ? activeTab : undefined,
          includeStats: true,
        },
      });
      if (response.data.success) {
        setBatches(response.data.data.batches);
        setTotalCount(response.data.data.total);
        if (response.data.data.stats) setStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  // Shared entry point used by mutation handlers (delete/restore/add/edit)
  // below, so they don't need to know which view is currently active.
  const loadInventory = () => (showArchived ? loadArchivedInventory() : loadActiveInventory());

  const loadMedicines = async () => {
    try {
      const response = await axios.get('/api/medicines/search', {
        params: { query: '', limit: 200 },
      });
      if (response.data.success) setMedicines(response.data.data);
    } catch (error) {
      console.error('Failed to load medicines for inventory modal:', error);
    }
  };

  const loadCompanies = async () => {
    try {
      const response = await axios.get('/api/companies');
      if (response.data.success) setCompanies(response.data.data);
    } catch (error) {
      console.error('Failed to load companies:', error);
    }
  };

  /* ---- delete handler (unchanged) ---- */
  const handleDeleteBatch = async (batch: InventoryBatch) => {
    const confirmed = window.confirm(
      `Delete batch ${batch.batchNumber} for ${batch.medicine.name}?`
    );
    if (!confirmed) return;
    try {
      const response = await axios.delete('/api/inventory/update', {
        params: { id: batch.id },
      });
      if (!response.data.success)
        throw new Error(response.data.message || 'Failed to delete inventory batch');
      toast.success(response.data.message || 'Inventory batch deleted successfully');
      await loadInventory();
    } catch (error) {
      console.error('Delete inventory batch error:', error);
      toast.error('Failed to delete inventory batch');
    }
  };

  const handleRestoreBatch = async (id: string) => {
    try {
      const response = await axios.post('/api/inventory/archived', { id });
      if (response.data.success) {
        toast.success('Inventory batch restored successfully');
        await loadInventory();
      }
    } catch (error) {
      toast.error('Failed to restore inventory batch');
    }
  };

  /* ---- derived data ----
   * Search, company filter, and tab filter are now applied server-side for
   * the ACTIVE view (see loadActiveInventory), so `batches` already holds
   * exactly the current page's rows for the active filter set. Archived
   * view still fetches its full (typically small) list once and filters +
   * paginates it client-side, same as the original implementation — so tab
   * filtering (low stock / expiring / expired) and stat counts both need to
   * run against `archivedBatches` here rather than relying on the
   * server-computed `stats`, which only reflects the active batch set.
   */
  const companyOptions = useMemo(() => companies.map((c) => c.name), [companies]);

  const archivedStats = useMemo(() => {
    let lowStock = 0;
    let expiring30 = 0;
    let expiring60 = 0;
    let expired = 0;
    archivedBatches.forEach((b) => {
      const d = daysUntilExpiry(b.expiryDate);
      if (b.stockQty <= 10) lowStock++;
      if (d < 0) expired++;
      else if (d <= 30) { expiring30++; expiring60++; }
      else if (d <= 60) expiring60++;
    });
    return { total: archivedBatches.length, lowStock, expiring30, expiring60, expired };
  }, [archivedBatches]);

  const displayList = showArchived
    ? archivedBatches.filter((b) => {
        if (activeTab === 'lowStock' && b.stockQty > 10) return false;
        if (activeTab === 'expiring30') {
          const d = daysUntilExpiry(b.expiryDate);
          if (!(d >= 0 && d <= 30)) return false;
        }
        if (activeTab === 'expiring60') {
          const d = daysUntilExpiry(b.expiryDate);
          if (!(d >= 0 && d <= 60)) return false;
        }
        if (activeTab === 'expired' && daysUntilExpiry(b.expiryDate) >= 0) return false;

        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          if (
            !b.medicine.name.toLowerCase().includes(q) &&
            !b.batchNumber.toLowerCase().includes(q) &&
            !b.medicine.company.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (companyFilter !== 'all' && b.medicine.company !== companyFilter) return false;
        return true;
      })
    : batches;

  const displayStats = showArchived ? archivedStats : stats;

  /* ---- sorting (current page only) + pagination ---- */
  const sortedBatches = useMemo(() => {
    if (!sortByExpiry) return displayList;
    return [...displayList].sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );
  }, [displayList, sortByExpiry]);

  const filteredCount = showArchived ? sortedBatches.length : totalCount;
  const totalPages = Math.max(1, Math.ceil(filteredCount / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedBatches = showArchived
    ? sortedBatches.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE)
    : sortedBatches;
  const showFrom = filteredCount === 0 ? 0 : (safePage - 1) * ROWS_PER_PAGE + 1;
  const showTo = Math.min(safePage * ROWS_PER_PAGE, filteredCount);

  /* ---- stat card click → switch tab ---- */
  const handleStatClick = (tab: TabKey) => setActiveTab(tab);

  /* ---- guards ---- */
  if (!isAuthorized) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground font-medium">Loading inventory…</p>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  const statCards: {
    key: TabKey;
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string; // ring / border accent
    textColor: string;
    bgColor: string;
  }[] = [
    {
      key: 'all',
      label: 'Total Batches',
      value: displayStats.total,
      icon: <Package className="h-5 w-5" />,
      color: 'border-primary/40 ring-primary/20',
      textColor: 'text-primary',
      bgColor: 'bg-primary/5',
    },
    {
      key: 'lowStock',
      label: 'Low Stock',
      value: displayStats.lowStock,
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'border-amber-400/60 ring-amber-400/20',
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      key: 'expiring30',
      label: 'Near Expiry 30d',
      value: displayStats.expiring30,
      icon: <Clock className="h-5 w-5" />,
      color: 'border-orange-400/60 ring-orange-400/20',
      textColor: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    },
    {
      key: 'expiring60',
      label: 'Expiring 60d',
      value: displayStats.expiring60,
      icon: <CalendarClock className="h-5 w-5" />,
      color: 'border-blue-400/60 ring-blue-400/20',
      textColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      key: 'expired',
      label: 'Expired',
      value: displayStats.expired,
      icon: <ShieldAlert className="h-5 w-5" />,
      color: 'border-red-400/60 ring-red-400/20',
      textColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950/30',
    },
  ];

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'all', label: 'All Batches', count: displayStats.total },
    { key: 'lowStock', label: 'Low Stock', count: displayStats.lowStock },
    { key: 'expiring30', label: 'Expiring 30d', count: displayStats.expiring30 },
    { key: 'expiring60', label: 'Expiring 60d', count: displayStats.expiring60 },
    { key: 'expired', label: 'Expired', count: displayStats.expired },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto page-enter">
      {/* ========== 1. PAGE HEADER ========== */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground uppercase">
            Inventory
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Track live stock, manage batches &amp; monitor expiry.
          </p>
        </div>

        {/* search bar (header-level) */}
        <div className="relative mt-3 sm:mt-0 w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            id="inventory-search"
            type="text"
            placeholder="Medicine, batch or company…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 rounded-xl border border-border bg-surface pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setShowArchived(false)}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${!showArchived ? 'bg-primary text-white shadow-soft' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Active Stock
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${showArchived ? 'bg-primary text-white shadow-soft' : 'text-muted-foreground hover:bg-muted'}`}
        >
          Archived Items
        </button>
      </div>

      {/* ========== 2. STAT CARDS ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const isActive = activeTab === card.key;
          return (
            <button
              key={card.key}
              onClick={() => handleStatClick(card.key)}
              className={`
                group relative flex flex-col gap-1.5 rounded-2xl border-2 p-4 text-left transition-all duration-200
                ${isActive
                  ? `${card.color} ring-2 ${card.bgColor} shadow-bento`
                  : 'border-border bg-surface hover:shadow-bento hover:-translate-y-0.5'
                }
              `}
            >
              <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isActive ? card.textColor : 'text-muted-foreground'}`}>
                {card.icon}
                {card.label}
              </div>
              <span className={`text-3xl font-extrabold ${isActive ? card.textColor : 'text-foreground'}`}>
                {card.value}
              </span>
            </button>
          );
        })}
      </div>

      {/* ========== 3. TAB BAR ========== */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                relative flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors duration-200
                ${isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              {tab.label}
              <span
                className={`
                  inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold leading-none
                  ${isActive ? 'bg-primary text-white' : 'bg-surface-muted text-muted-foreground'}
                `}
              >
                {tab.count}
              </span>
              {/* active underline */}
              {isActive && (
                <span className="absolute bottom-0 inset-x-1 h-[2.5px] rounded-t-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* ========== 4. TOOLBAR ========== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* left: summary */}
        <div>
          <h2 className="text-base font-bold text-foreground">Inventory Batches</h2>
          <p className="text-xs text-muted-foreground">
            Showing {showFrom}–{showTo} of {filteredCount} batches
          </p>
        </div>

        {/* right: controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* company filter */}
          <select
            id="company-filter"
            className="h-9 rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="all">All Companies</option>
            {companyOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* sort by expiry */}
          <Button
            variant={sortByExpiry ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => setSortByExpiry((v) => !v)}
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            Expiry
          </Button>

          {/* print inventory */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 hover:border-primary hover:text-primary"
            onClick={() => {
              const printUrl = new URL('/dashboard/inventory/print', window.location.origin);
              if (companyFilter && companyFilter !== 'all') {
                printUrl.searchParams.set('company', companyFilter);
                printUrl.searchParams.set('companyName', companyFilter);
              }
              window.open(printUrl.toString(), '_blank');
            }}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>

          {/* download excel */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 hover:border-primary hover:text-primary"
            onClick={() => { window.location.href = '/api/inventory/export'; }}
          >
            <FileDown className="h-3.5 w-3.5" />
            Download Excel
          </Button>

          {/* reorder list */}
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 hover:border-primary hover:text-primary"
            onClick={() => router.push('/dashboard/inventory/reorder-list')}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Reorder List
          </Button>

          {/* add inventory */}
          <Button
            size="sm"
            className="rounded-xl gap-1.5 shadow-soft"
            onClick={() => setShowAddInventoryModal(true)}
          >
            <Plus className="h-4 w-4" />
            Add Inventory
          </Button>
        </div>
      </div>

      {/* ========== 5. TABLE ========== */}
      <div className="rounded-2xl border border-border bg-surface shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/50">
                {['Medicine', 'Batch', 'Expiry', 'Stock', 'Purchase Rate', 'MRP', 'Packing', 'Rack', 'Actions'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`
                        px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground
                        ${['Purchase Rate', 'Packing'].includes(h) ? 'hidden md:table-cell' : ''}
                        ${h === 'Rack' ? 'hidden sm:table-cell' : ''}
                        ${h === 'Actions' ? 'text-right' : ''}
                      `}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {paginatedBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-muted-foreground">
                    <Package className="mx-auto h-10 w-10 mb-3 opacity-30" />
                    <p className="font-medium">No batches match your filters.</p>
                    <p className="text-xs mt-1">Try adjusting the search or tab selection.</p>
                  </td>
                </tr>
              ) : (
                paginatedBatches.map((batch) => {
                  const days = daysUntilExpiry(batch.expiryDate);

                  // row tint
                  const rowBg =
                    days < 0
                      ? 'bg-red-50/70 dark:bg-red-950/20'
                      : days <= 30
                        ? 'bg-amber-50/70 dark:bg-amber-950/20'
                        : days <= 60
                          ? 'bg-blue-50/50 dark:bg-blue-950/15'
                          : '';

                  // expiry chip
                  let chipLabel = '';
                  let chipClass = '';
                  if (days < 0) {
                    chipLabel = `Expired ${Math.abs(days)}d ago`;
                    chipClass = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
                  } else if (days <= 30) {
                    chipLabel = `⚠ ${days}d left`;
                    chipClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
                  } else if (days <= 60) {
                    chipLabel = `${days}d left`;
                    chipClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
                  }

                  // stock color
                  const stockColor =
                    batch.stockQty === 0
                      ? 'text-red-600 font-bold'
                      : batch.stockQty <= 10
                        ? 'text-amber-600 font-semibold'
                        : 'text-foreground';

                  return (
                    <tr
                      key={batch.id}
                      className={`group border-b border-border/60 transition-colors duration-150 hover:bg-surface-muted/40 ${rowBg}`}
                    >
                      {/* Medicine */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground leading-tight">{batch.medicine.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{batch.medicine.company}</div>
                      </td>

                      {/* Batch */}
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-md bg-surface-muted px-2 py-0.5 font-mono text-xs tracking-wide">
                          {batch.batchNumber}
                        </span>
                      </td>

                      {/* Expiry */}
                      <td className="px-4 py-3">
                        <div className="text-sm">{new Date(batch.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        {chipLabel && (
                          <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ${chipClass}`}>
                            {chipLabel}
                          </span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className={`px-4 py-3 tabular-nums ${stockColor}`}>
                        {batch.stockQty}
                      </td>

                      {/* Purchase Rate */}
                      <td className="px-4 py-3 hidden md:table-cell tabular-nums">
                        ₹{Number(batch.purchaseRate).toFixed(2)}
                      </td>

                      {/* MRP */}
                      <td className="px-4 py-3 tabular-nums font-medium">
                        ₹{Number(batch.mrp).toFixed(2)}
                      </td>

                      {/* Packing */}
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {batch.packing || '–'}
                      </td>

                      {/* Rack */}
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                        {batch.rackLocation || '–'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity duration-150">
                          {showArchived ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-xl"
                              onClick={() => handleRestoreBatch(batch.id)}
                            >
                              Restore
                            </Button>
                          ) : (
                            <button
                              onClick={() => setEditingBatch(batch)}
                              title="Edit inventory"
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteBatch(batch)}
                            title={showArchived ? 'Delete permanently' : 'Archive inventory'}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ---- Pagination ---- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | 'dots')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('dots');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'dots' ? (
                    <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={`inline-flex items-center justify-center h-8 min-w-[2rem] rounded-lg text-xs font-semibold transition-colors ${
                        safePage === item
                          ? 'bg-primary text-white'
                          : 'border border-border text-muted-foreground hover:bg-surface-muted'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========== MODALS (unchanged) ========== */}
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


    </div>
  );
}
