'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { toast } from 'sonner';
import axios from 'axios';
import { FileScan, ListPlus, Loader2, Plus, Printer, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ImportPriceList from '@/components/medicine/import-price-list';

import { batchIdentityKey, batchLabel } from '@/lib/batch';
import { packingOptionsFor } from '@/lib/stock-entry';
import { MedicineCombobox } from '@/components/purchases/MedicineCombobox';
import { ExpiryField } from '@/components/purchases/ExpiryField';
import { DecimalInput } from '@/components/purchases/DecimalInput';

interface PurchaseStats {
  todayPurchases: number;
  monthPurchases: number;
  pendingInvoices: number;
  lowStockMedicines: number;
}

interface SupplierOption {
  id: string;
  name: string;
  city?: string | null;
  phone: string;
}

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category?: string;
  packing?: string | null;
}

/** An existing batch of a medicine, used to suggest and complete batch rows. */
interface BatchHint {
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  packing?: string | null;
  rackLocation?: string | null;
  stockQty: number;
}

/** Fields of a purchase row the user can move through with Enter. */
const ROW_FIELDS = ['medicine', 'batch', 'expiry', 'quantity', 'price', 'mrp', 'packing'] as const;
type RowField = (typeof ROW_FIELDS)[number];

/** Focus a row field; the row is rendered twice (phone cards / table), so take the visible one. */
function focusRowField(tempId: string, field: RowField) {
  setTimeout(() => {
    const nodes = document.querySelectorAll<HTMLInputElement>(`[data-row="${tempId}"][data-field="${field}"]`);
    const visible = Array.from(nodes).find((node) => node.offsetParent !== null);
    visible?.focus();
    visible?.select?.();
  }, 30);
}

interface PurchaseItemForm {
  tempId: string;
  medicineId: string;
  medicineSearch?: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQty: number;
  purchaseRate: number;
  mrp: number;
  discount: number;
  gst: number;
  scheme: string;
  rackLocation: string;
  // Free-text packing (e.g. "10x10 Strips", "100ml"), saved on the batch
  // like Add Inventory. Quantity and rate are per stock unit.
  packing: string;
}

interface ScanPreviewItem extends PurchaseItemForm {
  medicineName: string;
  company?: string;
  matched: boolean;
  matchScore: number;
  matchStatus: 'matched' | 'possible' | 'new';
  suggestedMatch?: {
    id: string;
    name: string;
    score: number;
  } | null;
}

interface PurchaseHistoryItem {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  status: string;
  paymentType: string;
  totalAmount: number;
  supplier: {
    id: string;
    name: string;
    phone: string;
  };
}

interface CompanyOption {
  id: string;
  name: string;
}

interface PurchaseReturn {
  id: string;
  createdAt: string;
  quantity: number;
  reason: string;
  referenceId: string;
  medicine: {
    name: string;
    company: string;
  };
  batch: {
    batchNumber: string;
  };
}

interface PurchaseDetail {
  id: string;
  invoiceNumber: string;
  purchaseItems: Array<{
    id: string;
    medicineId: string;
    batchId: string;
    quantity: number;
    batch: {
      id: string;
      batchNumber: string;
      rackLocation?: string | null;
      stockQty: number;
    };
    medicine: {
      id: string;
      name: string;
      company: string;
    };
  }>;
}

const createEmptyPurchaseItem = (): PurchaseItemForm => ({
  tempId: crypto.randomUUID(),
  medicineId: '',
  medicineSearch: '',
  batchNumber: '',
  expiryDate: '',
  quantity: 1,
  freeQty: 0,
  purchaseRate: 0,
  mrp: 0,
  discount: 0,
  gst: 0,
  scheme: '',
  rackLocation: '',
  packing: '',
});

export default function PurchasesPage() {
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  const [stats, setStats] = useState<PurchaseStats | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [batchesByMedicine, setBatchesByMedicine] = useState<Record<string, BatchHint[]>>({});
  const [showNewMedicineDialog, setShowNewMedicineDialog] = useState(false);
  const [newMedicineName, setNewMedicineName] = useState('');
  const [newMedicineCategory, setNewMedicineCategory] = useState('');
  const [newMedicineCompany, setNewMedicineCompany] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newMedicineForRow, setNewMedicineForRow] = useState<string | null>(null);
  const [creatingMedicine, setCreatingMedicine] = useState(false);
  // setMessage and setError removed in favor of toast
  const [scanPreview, setScanPreview] = useState<ScanPreviewItem[]>([]);
  // Stored invoice file from the last scan; set on the form once applied.
  const [scanDocumentId, setScanDocumentId] = useState<string | null>(null);
  const [appliedDocumentId, setAppliedDocumentId] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState({
    matched: 0,
    possible: 0,
    newItems: 0,
  });
  const [showPriceListModal, setShowPriceListModal] = useState(false);
  const [appliedScanMeta, setAppliedScanMeta] = useState<
    Record<string, { status: ScanPreviewItem['matchStatus']; score: number }>
  >({});
  const [filters, setFilters] = useState({
    invoice: '',
    supplierId: 'all',
    status: 'all',
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    gstType: 'GST',
    paymentType: 'CASH',
    status: 'PAID',
    notes: '',
    items: [createEmptyPurchaseItem()],
  });
  const [returnForm, setReturnForm] = useState({
    purchaseId: '',
    batchId: '',
    medicineId: '',
    quantity: 1,
    reason: '',
  });

  useEffect(() => {
    if (isAuthorized) {
      void loadAll();
    }
  }, [isAuthorized]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [statsResponse, suppliersResponse, medicinesList, companiesResponse, historyResponse, returnsResponse] =
        await Promise.all([
          axios.get('/api/purchases', { params: { view: 'stats' } }),
          axios.get('/api/suppliers', { params: { limit: 200 } }),
          loadAllMedicines(),
          axios.get('/api/companies'),
          axios.get('/api/purchases'),
          axios.get('/api/purchases/returns'),
        ]);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }
      if (suppliersResponse.data.success) {
        setSuppliers(suppliersResponse.data.data);
      }
      if (medicinesList) {
        setMedicines(medicinesList);
        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(medicinesList.map((m: MedicineOption) => m.category || '').filter(Boolean))
        ).sort();
        setCategories(uniqueCategories as string[]);
      }
      if (companiesResponse.data.success) {
        setCompanies(companiesResponse.data.data);
      }
      if (historyResponse.data.success) {
        setHistory(historyResponse.data.data);
      }
      if (returnsResponse.data.success) {
        setReturns(returnsResponse.data.data);
      }
    } catch (loadError) {
      console.error('Failed to load purchases page:', loadError);
      toast.error('Failed to load purchases data');
    } finally {
      setLoading(false);
    }
  };

  const loadAllMedicines = async (): Promise<MedicineOption[]> => {
    const limit = 500;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    const allMedicines: MedicineOption[] = [];

    while (offset < total) {
      const response = await axios.get('/api/medicines/search', {
        params: { query: '', limit, offset },
      });

      if (!response.data.success) {
        throw new Error('Failed to load medicines');
      }

      const pageMedicines: MedicineOption[] = response.data.data || [];
      allMedicines.push(...pageMedicines);
      total = Number(response.data.total || pageMedicines.length);

      if (pageMedicines.length === 0) {
        break;
      }

      offset += limit;
    }

    return allMedicines;
  };

  const filteredHistory = useMemo(() => {
    return history.filter((purchase) => {
      const matchesInvoice = !filters.invoice
        ? true
        : purchase.invoiceNumber.toLowerCase().includes(filters.invoice.toLowerCase());
      const matchesSupplier =
        filters.supplierId === 'all' || purchase.supplier.id === filters.supplierId;
      const matchesStatus = filters.status === 'all' || purchase.status === filters.status;
      return matchesInvoice && matchesSupplier && matchesStatus;
    });
  }, [filters, history]);

  const totals = useMemo(() => {
    const subtotal = purchaseForm.items.reduce(
      (sum, item) => sum + item.quantity * item.purchaseRate,
      0
    );
    const discountTotal = purchaseForm.items.reduce((sum, item) => sum + item.discount, 0);
    const gstTotal = purchaseForm.items.reduce((sum, item) => sum + item.gst, 0);
    return {
      subtotal,
      discountTotal,
      gstTotal,
      grandTotal: subtotal - discountTotal + gstTotal,
    };
  }, [purchaseForm.items]);

  const handlePurchaseItemChange = (
    tempId: string,
    field: keyof PurchaseItemForm,
    value: string | number
  ) => {
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.tempId === tempId ? { ...item, [field]: value } : item
      ),
    }));
  };

  const updateRow = (tempId: string, change: (item: PurchaseItemForm) => PurchaseItemForm) => {
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.tempId === tempId ? change(item) : item)),
    }));
  };

  /**
   * Like Add Inventory: after a medicine is chosen, fill what the shop
   * already knows from its latest batch (MRP, packing, rack, last purchase
   * rate) and load its batches for the Batch suggestions. Only empty fields
   * are filled, so typed or scanned values win.
   */
  const autofillFromHistory = async (tempId: string, medicineId: string) => {
    const [last, batches] = await Promise.all([
      axios.get(`/api/medicines/${medicineId}/last-mrp`).then((r) => (r.data.success ? r.data.data : null)).catch(() => null),
      axios
        .get('/api/inventory/batches', { params: { medicineId } })
        .then((r) => (r.data.success && Array.isArray(r.data.data) ? (r.data.data as BatchHint[]) : []))
        .catch(() => [] as BatchHint[]),
    ]);
    setBatchesByMedicine((current) => ({ ...current, [medicineId]: batches }));
    if (!last) return;
    updateRow(tempId, (item) =>
      item.medicineId !== medicineId
        ? item
        : {
            ...item,
            mrp: item.mrp > 0 ? item.mrp : Number(last.mrp) || 0,
            packing: item.packing.trim() ? item.packing : last.packing || '',
            rackLocation: item.rackLocation.trim() ? item.rackLocation : last.rackLocation || '',
            purchaseRate: item.purchaseRate > 0 ? item.purchaseRate : Number(last.purchaseRate) || 0,
          }
    );
  };

  const handleMedicineSelect = (tempId: string, medicine: MedicineOption) => {
    updateRow(tempId, (item) => ({
      ...item,
      medicineId: medicine.id,
      medicineSearch: medicine.name,
      packing: item.packing.trim() ? item.packing : medicine.packing || '',
    }));
    focusRowField(tempId, 'batch');
    void autofillFromHistory(tempId, medicine.id);
  };

  /** Typing an existing batch number completes the row from that batch. */
  const handleBatchChange = (item: PurchaseItemForm, batchNumber: string) => {
    const existing = (batchesByMedicine[item.medicineId] || []).find(
      (batch) => batch.batchNumber.trim().toUpperCase() === batchNumber.trim().toUpperCase()
    );
    updateRow(item.tempId, (row) =>
      existing
        ? {
            ...row,
            batchNumber,
            expiryDate: String(existing.expiryDate).slice(0, 10),
            mrp: Number(existing.mrp) || row.mrp,
            packing: existing.packing || row.packing,
            rackLocation: row.rackLocation.trim() ? row.rackLocation : existing.rackLocation || '',
          }
        : { ...row, batchNumber }
    );
  };

  /** Enter on a field moves to the next one; on Packing it starts a new row. */
  const handleRowEnter = (item: PurchaseItemForm, field: RowField) => {
    const next = ROW_FIELDS[ROW_FIELDS.indexOf(field) + 1];
    if (next) {
      focusRowField(item.tempId, next);
      return;
    }
    const items = purchaseForm.items;
    const index = items.findIndex((row) => row.tempId === item.tempId);
    const following = items[index + 1];
    if (following) {
      focusRowField(following.tempId, 'medicine');
      return;
    }
    const fresh = createEmptyPurchaseItem();
    setPurchaseForm((current) => ({ ...current, items: [...current.items, fresh] }));
    focusRowField(fresh.tempId, 'medicine');
  };

  const enterKey = (item: PurchaseItemForm, field: RowField) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleRowEnter(item, field);
  };

  const handleCompanyChange = (companyName: string) => {
    setSelectedCompany(companyName);
    setPurchaseForm((current) => ({
      ...current,
      items: current.items.map((item) => {
        const selectedMedicine = medicines.find((medicine) => medicine.id === item.medicineId);
        const keepSelected =
          !companyName || !selectedMedicine || selectedMedicine.company === companyName;

        return keepSelected ? item : { ...item, medicineId: '', medicineSearch: '' };
      }),
    }));
  };

  const addPurchaseRow = () => {
    setPurchaseForm((current) => ({
      ...current,
      items: [...current.items, createEmptyPurchaseItem()],
    }));
  };

  const removePurchaseRow = (tempId: string) => {
    setPurchaseForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? current.items
          : current.items.filter((item) => item.tempId !== tempId),
    }));
  };

  const handleSavePurchase = async () => {
    setSaving(true);

    try {
      if (!purchaseForm.supplierId || !purchaseForm.invoiceNumber.trim()) {
        toast.error('Supplier and invoice number are required.');
        setSaving(false);
        return;
      }
      const invalidRow = purchaseForm.items.find(
        (item) =>
          !item.medicineId ||
          !item.batchNumber.trim() ||
          !item.expiryDate ||
          item.quantity <= 0 ||
          item.purchaseRate <= 0 ||
          item.mrp <= 0
      );
      if (invalidRow) {
        toast.error('Please fill medicine, batch, expiry, quantity, rate, and MRP for all rows.');
        setSaving(false);
        return;
      }

      // Check for duplicate batches (same medicine + batch number + expiry +
      // packing). A different expiry or packing is a separate batch.
      const batchMap = new Map<string, number>();
      for (let i = 0; i < purchaseForm.items.length; i++) {
        const item = purchaseForm.items[i];
        const batchKey = `${batchIdentityKey(item.medicineId, item.batchNumber, item.expiryDate)}|${item.packing.trim().replace(/\s+/g, ' ').toLowerCase()}`;
        if (batchMap.has(batchKey)) {
          const firstIndex = batchMap.get(batchKey)!;
          toast.error(
            `Duplicate batch detected: ${batchLabel(item)} for the same medicine appears in row ${firstIndex + 1} and row ${i + 1}`
          );
          setSaving(false);
          return;
        }
        batchMap.set(batchKey, i);
      }

      const response = await axios.post('/api/purchases', {
        ...purchaseForm,
        documentId: appliedDocumentId,
        items: purchaseForm.items.map(({ tempId, medicineSearch, packing, ...item }) => ({
          ...item,
          packing: packing.trim() || undefined,
        })),
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save purchase');
      }

      toast.success(response.data.message || 'Purchase saved successfully');
      setPurchaseForm({
        supplierId: '',
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        gstType: 'GST',
        paymentType: 'CASH',
        status: 'PAID',
        notes: '',
        items: [createEmptyPurchaseItem()],
      });
      setSelectedCompany('');
      setAppliedDocumentId(null);
      setAppliedScanMeta({});
      await loadAll();
    } catch (saveError) {
      const messageText = axios.isAxiosError(saveError)
        ? saveError.response?.data?.message
        : 'Failed to save purchase';
      toast.error(messageText || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPurchaseDetail = async (purchaseId: string) => {
    try {
      const response = await axios.get(`/api/purchases/${purchaseId}`);
      if (response.data.success) {
        setSelectedPurchase(response.data.data);
        setReturnForm({
          purchaseId: response.data.data.id,
          batchId: '',
          medicineId: '',
          quantity: 1,
          reason: '',
        });
      }
    } catch (detailError) {
      console.error('Failed to load purchase detail:', detailError);
      toast.error('Failed to load purchase detail');
    }
  };

  const handleCreateReturn = async () => {
    try {
      const response = await axios.post('/api/purchases/returns', returnForm);
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create purchase return');
      }

      toast.success(response.data.message || 'Purchase return recorded successfully');
      setReturnForm({
        purchaseId: '',
        batchId: '',
        medicineId: '',
        quantity: 1,
        reason: '',
      });
      setSelectedPurchase(null);
      await loadAll();
    } catch (returnError) {
      const messageText = axios.isAxiosError(returnError)
        ? returnError.response?.data?.message
        : 'Failed to create purchase return';
      toast.error(messageText || 'Failed to create purchase return');
    }
  };

  const handleScanInvoice = async (file: File | null) => {
    if (!file) {
      return;
    }

    setScanning(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('/api/purchases/scan-invoice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to scan invoice');
      }

      const scanItems: ScanPreviewItem[] = response.data.data || [];
      const matched = scanItems.filter((item) => item.matchStatus === 'matched').length;
      const possible = scanItems.filter((item) => item.matchStatus === 'possible').length;
      const newItems = scanItems.filter((item) => item.matchStatus === 'new').length;

      setScanPreview(scanItems);
      setScanDocumentId(response.data.documentId || null);
      setScanSummary({ matched, possible, newItems });
      toast.info('Invoice scanned. Please review and apply the results.');
    } catch (scanError) {
      const messageText = axios.isAxiosError(scanError)
        ? scanError.response?.data?.message
        : 'Failed to scan invoice';
      toast.error(messageText || 'Failed to scan invoice');
    } finally {
      setScanning(false);
    }
  };

  const applyScanResults = () => {
    if (scanPreview.length === 0) {
      return;
    }

    const meta: Record<string, { status: ScanPreviewItem['matchStatus']; score: number }> = {};
    scanPreview.forEach((item) => {
      meta[item.tempId] = { status: item.matchStatus, score: item.matchScore };
    });

    setPurchaseForm((current) => ({
      ...current,
      items: scanPreview.map((item) => ({
        tempId: item.tempId,
        medicineId: item.medicineId,
        medicineSearch: item.medicineName || '',
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        freeQty: item.freeQty,
        purchaseRate: item.purchaseRate,
        mrp: item.mrp,
        discount: item.discount,
        gst: item.gst,
        scheme: item.scheme,
        rackLocation: item.rackLocation,
        packing: item.packing || '',
      })),
    }));

    setScanPreview([]);
    setScanSummary({ matched: 0, possible: 0, newItems: 0 });
    setAppliedScanMeta(meta);
    setAppliedDocumentId(scanDocumentId);
    // Matched lines get the shop's known MRP/packing/rack where the invoice had none.
    scanPreview.forEach((item) => {
      if (item.medicineId) void autofillFromHistory(item.tempId, item.medicineId);
    });
    toast.success('OCR results applied to purchase form. Please verify and save.');
  };

  const discardScanResults = () => {
    setScanPreview([]);
    setScanSummary({ matched: 0, possible: 0, newItems: 0 });
    setAppliedScanMeta({});
    setScanDocumentId(null);
    toast.info('OCR results discarded.');
  };

  const handleCreateNewMedicine = async () => {
    if (!newMedicineName.trim()) {
      toast.error('Medicine name is required');
      return;
    }
    const companyName = (newMedicineCompany === '__new__' ? newCompanyName : newMedicineCompany).trim();
    if (!companyName) {
      toast.error('Please choose the company');
      return;
    }
    if (!newMedicineCategory.trim()) {
      toast.error('Category is required');
      return;
    }

    try {
      setCreatingMedicine(true);
      const response = await axios.post('/api/medicines/search', {
        name: newMedicineName.trim().toUpperCase(),
        company: companyName,
        category: newMedicineCategory.trim(),
      });

      if (response.data.success) {
        const newMedicine = response.data.data;
        toast.success(`Medicine "${newMedicine.name}" created successfully`);
        
        // Add to medicines list
        setMedicines((prev) => [...prev, {
          id: newMedicine.id,
          name: newMedicine.name,
          company: newMedicine.company,
          category: newMedicine.category,
        }]);

        // Update the row with the new medicine
        if (newMedicineForRow) {
          setPurchaseForm((current) => ({
            ...current,
            items: current.items.map((item) =>
              item.tempId === newMedicineForRow
                ? {
                    ...item,
                    medicineId: newMedicine.id,
                    medicineSearch: newMedicine.name,
                  }
                : item
            ),
          }));
        }

        if (!companies.some((company) => company.name === newMedicine.company)) {
          setCompanies((prev) => [...prev, { id: newMedicine.company, name: newMedicine.company }]);
        }

        // Reset dialog
        closeNewMedicineDialog();
      }
    } catch (error) {
      console.error('Failed to create medicine:', error);
      const serverMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || error.response?.data?.message
        : null;
      toast.error(serverMessage || 'Failed to create medicine');
    } finally {
      setCreatingMedicine(false);
    }
  };

  const handleMedicineNotFound = (tempId: string, searchValue: string) => {
    setNewMedicineName(searchValue.toUpperCase());
    setNewMedicineCompany(selectedCompany);
    setNewCompanyName('');
    setNewMedicineForRow(tempId);
    setShowNewMedicineDialog(true);
  };

  const closeNewMedicineDialog = () => {
    setShowNewMedicineDialog(false);
    setNewMedicineName('');
    setNewMedicineCategory('');
    setNewMedicineCompany('');
    setNewCompanyName('');
    setNewMedicineForRow(null);
  };

  // Filter medicines by selected company
  const companyFilteredMedicines = useMemo(() => {
    if (!selectedCompany) return medicines;
    return medicines.filter((m) => m.company === selectedCompany);
  }, [medicines, selectedCompany]);

  const getMedicineOptionsForRow = (item: PurchaseItemForm) => {
    const query = item.medicineSearch?.trim().toLowerCase() || '';

    const options = !query
      ? companyFilteredMedicines
      : companyFilteredMedicines.filter(
          (medicine) =>
            medicine.name.toLowerCase().includes(query) ||
            medicine.company.toLowerCase().includes(query)
        );

    // Keep the row's chosen medicine listed even when the company filter or
    // search text would hide it (e.g. one just created for another company).
    if (item.medicineId && !options.some((medicine) => medicine.id === item.medicineId)) {
      const chosen = medicines.find((medicine) => medicine.id === item.medicineId);
      if (chosen) return [chosen, ...options];
    }
    return options;
  };

  const hasExactMedicineName = (name: string) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;

    return companyFilteredMedicines.some(
      (medicine) => medicine.name.trim().toLowerCase() === normalized
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading purchases...</div>;
  }

  const fieldClass = 'h-11 md:h-9 w-full rounded-xl border-border bg-surface focus-visible:ring-primary/20';
  const selectClass =
    'h-11 md:h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all';

  /** Every input of one purchase line; laid out as a table row or a phone card. */
  const renderItemFields = (item: PurchaseItemForm) => {
    const meta = appliedScanMeta[item.tempId];
    const rowMedicineOptions = getMedicineOptionsForRow(item);
    const rowSearch = item.medicineSearch?.trim() || '';
    const canCreateMedicine = Boolean(rowSearch) && !item.medicineId && !hasExactMedicineName(rowSearch);
    const rowMedicine = item.medicineId ? medicines.find((medicine) => medicine.id === item.medicineId) : undefined;
    const rowBatches = item.medicineId ? batchesByMedicine[item.medicineId] || [] : [];
    const existingBatch = item.batchNumber.trim()
      ? rowBatches.find((batch) => batch.batchNumber.trim().toUpperCase() === item.batchNumber.trim().toUpperCase())
      : undefined;
    // Packing suggestions: this medicine's known packings, then its category's usual sizes.
    const rowPackings = Array.from(
      new Set(
        [rowMedicine?.packing, ...rowBatches.map((batch) => batch.packing), ...packingOptionsFor(rowMedicine?.category)]
          .map((option) => (option || '').trim())
          .filter(Boolean)
      )
    );
    const isLastRow = purchaseForm.items[purchaseForm.items.length - 1]?.tempId === item.tempId;

    return {
      medicine: (
        <div>
          <MedicineCombobox
            value={item.medicineSearch || ''}
            selectedId={item.medicineId}
            options={rowMedicineOptions}
            className={fieldClass}
            data-row={item.tempId}
            data-field="medicine"
            onTextChange={(text) => updateRow(item.tempId, (row) => ({ ...row, medicineSearch: text, medicineId: '' }))}
            onSelect={(medicine) => handleMedicineSelect(item.tempId, medicine as MedicineOption)}
            onEnterNext={() => (item.medicineId ? handleRowEnter(item, 'medicine') : undefined)}
          />
          {meta && (
            <div className="mt-1 text-[11px] font-medium text-muted-foreground">
              Scan: {meta.status} ({Math.round(meta.score * 100)}%)
            </div>
          )}
          {canCreateMedicine && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-10 md:h-8 w-full justify-start gap-1.5 rounded-xl border-dashed text-xs text-primary"
              onClick={() => handleMedicineNotFound(item.tempId, rowSearch)}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Add &quot;{rowSearch}&quot; as new medicine</span>
            </Button>
          )}
        </div>
      ),
      batch: (
        <div>
          <Input
            value={item.batchNumber}
            className={fieldClass}
            placeholder="Batch no."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="next"
            list={rowBatches.length ? `batches-${item.tempId}` : undefined}
            data-row={item.tempId}
            data-field="batch"
            onKeyDown={enterKey(item, 'batch')}
            onChange={(event) => handleBatchChange(item, event.target.value)}
          />
          {rowBatches.length > 0 && (
            <datalist id={`batches-${item.tempId}`}>
              {rowBatches.map((batch) => (
                <option key={`${batch.batchNumber}-${batch.expiryDate}`} value={batch.batchNumber}>
                  {`Exp ${String(batch.expiryDate).slice(5, 7)}/${String(batch.expiryDate).slice(2, 4)} · MRP ${batch.mrp} · stock ${batch.stockQty}`}
                </option>
              ))}
            </datalist>
          )}
          {existingBatch && (
            <div className="mt-1 text-[11px] font-medium text-primary">Adds to existing batch (stock {existingBatch.stockQty})</div>
          )}
        </div>
      ),
      expiry: (
        <ExpiryField
          value={item.expiryDate}
          className="h-11 md:h-9 rounded-xl"
          data-row={item.tempId}
          data-field="expiry"
          onChange={(iso) => handlePurchaseItemChange(item.tempId, 'expiryDate', iso)}
          onEnterNext={() => handleRowEnter(item, 'expiry')}
        />
      ),
      pack: (
        <div>
          <Input
            value={item.packing}
            className={fieldClass}
            placeholder="e.g. 10x10 Strips, 100ml"
            aria-label="Packing"
            maxLength={100}
            autoComplete="off"
            enterKeyHint={isLastRow ? 'done' : 'next'}
            list={rowPackings.length ? `packings-${item.tempId}` : undefined}
            data-row={item.tempId}
            data-field="packing"
            onKeyDown={enterKey(item, 'packing')}
            onChange={(event) => handlePurchaseItemChange(item.tempId, 'packing', event.target.value)}
          />
          {rowPackings.length > 0 && (
            <datalist id={`packings-${item.tempId}`}>
              {rowPackings.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
        </div>
      ),
      quantity: (
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={item.quantity ? String(item.quantity) : ''}
          placeholder="Qty"
          aria-label="Quantity"
          enterKeyHint="next"
          autoComplete="off"
          className={`${fieldClass} text-right`}
          data-row={item.tempId}
          data-field="quantity"
          onKeyDown={enterKey(item, 'quantity')}
          onChange={(event) =>
            handlePurchaseItemChange(item.tempId, 'quantity', Number(event.target.value.replace(/\D/g, '').slice(0, 7)) || 0)
          }
        />
      ),
      price: (
        <DecimalInput
          value={item.purchaseRate}
          ariaLabel="Purchase rate"
          placeholder="Rate"
          className={`${fieldClass} text-right`}
          row={item.tempId}
          field="price"
          onKeyDown={enterKey(item, 'price')}
          onChange={(value) => handlePurchaseItemChange(item.tempId, 'purchaseRate', value)}
        />
      ),
      mrp: (
        <DecimalInput
          value={item.mrp}
          ariaLabel="MRP"
          placeholder="MRP"
          className={`${fieldClass} text-right`}
          row={item.tempId}
          field="mrp"
          onKeyDown={enterKey(item, 'mrp')}
          onChange={(value) => handlePurchaseItemChange(item.tempId, 'mrp', value)}
        />
      ),
      rack: (
        <Input
          value={item.rackLocation}
          placeholder="Optional"
          autoComplete="off"
          className={fieldClass}
          onChange={(event) => handlePurchaseItemChange(item.tempId, 'rackLocation', event.target.value)}
        />
      ),
      remove: (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove item"
          className="h-10 w-10 md:h-8 md:w-8 text-muted-foreground hover:bg-danger/10 hover:text-danger rounded-lg"
          onClick={() => removePurchaseRow(item.tempId)}
        >
          <Plus className="h-4 w-4 rotate-45" />
        </Button>
      ),
    };
  };

  return (
    <div className="space-y-5 md:space-y-6 p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-large-title text-foreground">Purchases</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Create distributor invoices manually or scan them automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2" onClick={() => void loadAll()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <input
        ref={scanInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          void handleScanInvoice(file);
          event.target.value = '';
        }}
      />



      {stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <Card className="rounded-card shadow-card border-border bg-surface transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-xs font-bold text-muted-foreground/60">Today Purchases</CardTitle>
              <CardDescription className="text-3xl font-bold text-primary">
                {stats.todayPurchases}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-card shadow-card border-border bg-surface transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-xs font-bold text-muted-foreground/60">Month Purchases</CardTitle>
              <CardDescription className="text-3xl font-bold text-blue-400">
                {stats.monthPurchases}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-card shadow-card border-border bg-surface transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-xs font-bold text-muted-foreground/60">Pending Invoices</CardTitle>
              <CardDescription className="text-3xl font-bold text-warning">
                {stats.pendingInvoices}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-card shadow-card border-border bg-surface transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-xs font-bold text-muted-foreground/60">Low Stock</CardTitle>
              <CardDescription className="text-3xl font-bold text-danger">
                {stats.lowStockMedicines}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue="new" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-surface-muted/50 p-1.5 shadow-inner">
          <TabsTrigger value="new" className="rounded-xl px-1 text-xs sm:text-sm font-bold py-2.5 data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-sm">
            New Invoice
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl px-1 text-xs sm:text-sm font-bold py-2.5 data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-sm">
            Invoice History
          </TabsTrigger>
          <TabsTrigger value="returns" className="rounded-xl px-1 text-xs sm:text-sm font-bold py-2.5 data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-sm">
            Returns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <Card className="rounded-card shadow-card border-border bg-surface">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-xl font-bold text-foreground">Distributor Invoice Entry</CardTitle>
                  <CardDescription className="font-medium text-muted-foreground">
                    Create invoices manually or scan them automatically
                  </CardDescription>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button
                    variant="outline"
                    className="h-11 sm:h-10 gap-2"
                    disabled={scanning}
                    onClick={() => scanInputRef.current?.click()}
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileScan className="h-4 w-4" />}
                    {scanning ? 'Scanning…' : 'Scan Invoice'}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 sm:h-10 gap-2"
                    onClick={() => setShowPriceListModal(true)}
                  >
                    <ListPlus className="h-4 w-4" />
                    Price List
                  </Button>
                  <Button className="col-span-2 sm:col-span-1 h-11 sm:h-10 gap-2" onClick={addPurchaseRow}>
                    <Plus className="h-4 w-4" />
                    <span className="sm:hidden">Add Row</span>
                    <span className="hidden sm:inline">Add Medicine Row</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {scanPreview.length > 0 ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                  <div className="font-semibold text-primary">OCR Review Required</div>
                  <div className="mt-1">
                    Matched: {scanSummary.matched} · Possible duplicates: {scanSummary.possible} · New: {scanSummary.newItems}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="gap-2" onClick={applyScanResults}>
                      Apply OCR Results
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={discardScanResults}>
                      Discard Scan
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-primary/70">
                    Review possible or new items after applying. You can choose the correct medicine for each row.
                  </div>
                </div>
              ) : null}
              
              {scanPreview.length === 0 && purchaseForm.items.length === 1 && !purchaseForm.items[0].medicineId && !purchaseForm.supplierId ? (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 dark:text-blue-400">
                  <div className="font-semibold">Manual Invoice Entry</div>
                  <div className="mt-1 space-y-1">
                    <p>Enter distributor invoice details manually using the form below:</p>
                    <ul className="list-disc list-inside ml-2 text-xs space-y-0.5">
                      <li>Select a company to filter medicines</li>
                      <li>Fill in supplier and invoice header details</li>
                      <li>Add medicine rows and enter batch, expiry, quantity, and pricing</li>
                      <li>Or click "Scan Invoice" above to extract data from a PDF/image automatically</li>
                    </ul>
                  </div>
                </div>
              ) : null}

              {/* Company Selection */}
              <div className="rounded-2xl border border-border bg-surface-muted/30 p-4">
                <Label className="text-sm font-bold mb-2 block">Select Company (Optional - filters medicine list)</Label>
                <select
                  className="h-10 w-full md:w-1/3 rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  value={selectedCompany}
                  onChange={(event) => handleCompanyChange(event.target.value)}
                >
                  <option value="">All Companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.name}>
                      {company.name}
                    </option>
                  ))}
                </select>
                {selectedCompany && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing medicines from: <span className="font-semibold text-foreground">{selectedCompany}</span>
                  </p>
                )}
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    value={purchaseForm.supplierId}
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        supplierId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Invoice Number</Label>
                  <Input
                    value={purchaseForm.invoiceNumber}
                    className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        invoiceNumber: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={purchaseForm.invoiceDate}
                    className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        invoiceDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>GST Type</Label>
                  <Input
                    value={purchaseForm.gstType}
                    className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        gstType: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Type</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    value={purchaseForm.paymentType}
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        paymentType: event.target.value,
                      }))
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    value={purchaseForm.status}
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={purchaseForm.notes}
                    className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Phones: one card per medicine, fields stacked and full width. */}
              <div className="space-y-3 md:hidden">
                {purchaseForm.items.map((item, index) => {
                  const f = renderItemFields(item);
                  return (
                    <div key={item.tempId} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          Item {index + 1}
                        </span>
                        {f.remove}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Medicine</Label>
                          {f.medicine}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Batch</Label>
                            {f.batch}
                          </div>
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Expiry</Label>
                            {f.expiry}
                          </div>
                        </div>
                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Packing</Label>
                          {f.pack}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Quantity</Label>
                            {f.quantity}
                          </div>
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Rate</Label>
                            {f.price}
                          </div>
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">MRP</Label>
                            {f.mrp}
                          </div>
                        </div>
                        <div>
                          <Label className="mb-1.5 block text-xs text-muted-foreground">Rack (optional)</Label>
                          {f.rack}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <Button variant="outline" className="h-12 w-full gap-2 rounded-2xl border-dashed" onClick={addPurchaseRow}>
                  <Plus className="h-4 w-4" />
                  Add another medicine
                </Button>
              </div>

              {/* Tablets and desktop: the dense table. */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-border mt-4">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-muted/50 border-b border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Medicine</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Batch</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Expiry</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Packing</TableHead>
                      <TableHead className="text-right font-bold text-muted-foreground text-[11px] py-3">Quantity</TableHead>
                      <TableHead className="text-right font-bold text-muted-foreground text-[11px] py-3">Rate</TableHead>
                      <TableHead className="text-right font-bold text-muted-foreground text-[11px] py-3">MRP</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Rack (Optional)</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseForm.items.map((item) => {
                      const f = renderItemFields(item);
                      return (
                        <TableRow key={item.tempId} className="border-border align-top">
                          <TableCell className="min-w-[250px]">{f.medicine}</TableCell>
                          <TableCell className="min-w-[130px]">{f.batch}</TableCell>
                          <TableCell className="min-w-[150px]">{f.expiry}</TableCell>
                          <TableCell className="min-w-[170px]">{f.pack}</TableCell>
                          <TableCell className="text-right"><div className="w-20 ml-auto">{f.quantity}</div></TableCell>
                          <TableCell className="text-right"><div className="w-24 ml-auto">{f.price}</div></TableCell>
                          <TableCell className="text-right"><div className="w-24 ml-auto">{f.mrp}</div></TableCell>
                          <TableCell><div className="w-24">{f.rack}</div></TableCell>
                          <TableCell>{f.remove}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
                <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
                  Subtotal: <span className="font-semibold text-foreground">₹{totals.subtotal.toFixed(2)}</span>
                  {totals.discountTotal > 0 && (
                    <>
                      {' · '}
                      Discount: <span className="font-semibold text-foreground">₹{totals.discountTotal.toFixed(2)}</span>
                    </>
                  )}
                  {totals.gstTotal > 0 && (
                    <>
                      {' · '}
                      GST: <span className="font-semibold text-foreground">₹{totals.gstTotal.toFixed(2)}</span>
                    </>
                  )}
                  {' · '}
                  Grand Total:{' '}
                  <span className="font-semibold text-foreground">₹{totals.grandTotal.toFixed(2)}</span>
                </div>
                <Button className="h-12 md:h-10 gap-2 text-base md:text-sm" onClick={handleSavePurchase} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Purchase'}
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-card border-border bg-surface shadow-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Purchase History</CardTitle>
              <CardDescription className="font-medium text-muted-foreground">Track invoices and quick filters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  placeholder="Search invoice number"
                  className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                  value={filters.invoice}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, invoice: event.target.value }))
                  }
                />
                <select
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  value={filters.supplierId}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, supplierId: event.target.value }))
                  }
                >
                  <option value="all">All suppliers</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="all">All status</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="PARTIAL">Partial</option>
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border mt-4">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-muted/50 border-b border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-bold text-muted-foreground text-[11px]">Invoice</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px]">Supplier</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px]">Status</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px]">Payment</TableHead>
                      <TableHead className="text-right font-bold text-muted-foreground text-[11px]">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 ? (
                      <TableRow className="border-border">
                        <TableCell colSpan={6} className="text-center py-10 font-bold text-muted-foreground">
                          No purchases found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHistory.map((purchase) => (
                        <TableRow key={purchase.id} className="hover:bg-primary/5 transition-colors border-border">
                          <TableCell className="font-bold text-foreground">{purchase.invoiceNumber}</TableCell>
                          <TableCell className="font-bold text-foreground">{purchase.supplier.name}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-xl border border-border px-3 py-1 text-[11px]   font-bold shadow-sm ${purchase.status === 'PAID' ? 'bg-primary/20 text-primary border-primary/20' : 'bg-danger/20 text-danger border-danger/20'}`}>
                              {purchase.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1 text-[11px] font-bold text-foreground shadow-sm">{purchase.paymentType}</span>
                          </TableCell>
                          <TableCell className="text-right text-lg font-bold text-blue-400">₹{purchase.totalAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" className="rounded-xl font-bold" onClick={() => void handleLoadPurchaseDetail(purchase.id)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>

              {selectedPurchase ? (
                <Card className="rounded-card border-border bg-surface shadow-card mt-8 border-2 border-primary/10">
                  <CardHeader>
                    <CardTitle className="text-xl font-bold text-primary">Create Return</CardTitle>
                    <CardDescription className="font-medium text-muted-foreground">Selected invoice: {selectedPurchase.invoiceNumber}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-3">
                      <select
                        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        value={returnForm.batchId}
                        onChange={(event) => {
                          const batchId = event.target.value;
                          const item = selectedPurchase.purchaseItems.find((row) => row.batchId === batchId);
                          setReturnForm((current) => ({
                            ...current,
                            batchId,
                            medicineId: item?.medicineId || '',
                          }));
                        }}
                      >
                        <option value="">Select batch</option>
                        {selectedPurchase.purchaseItems.map((item) => (
                          <option key={item.batchId} value={item.batchId}>
                            {item.medicine.name} · {batchLabel(item.batch)}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={1}
                        value={returnForm.quantity}
                        className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                        onChange={(event) =>
                          setReturnForm((current) => ({
                            ...current,
                            quantity: Number(event.target.value),
                          }))
                        }
                      />
                      <Input
                        placeholder="Reason"
                        value={returnForm.reason}
                        className="rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                        onChange={(event) =>
                          setReturnForm((current) => ({
                            ...current,
                            reason: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button onClick={handleCreateReturn} className="gap-2">
                      Submit Return
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card className="rounded-card border-border bg-surface shadow-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-foreground">Purchase Returns</CardTitle>
              <CardDescription className="font-medium text-muted-foreground">Track supplier returns logged in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-2xl border border-border mt-4">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-muted/50 border-b border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Date</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Medicine</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Batch</TableHead>
                      <TableHead className="text-right font-bold text-muted-foreground text-[11px] py-3">Qty</TableHead>
                      <TableHead className="font-bold text-muted-foreground text-[11px] py-3">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.length === 0 ? (
                      <TableRow className="border-border">
                        <TableCell colSpan={5} className="text-center py-10 font-bold text-muted-foreground">
                          No returns recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      returns.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-primary/5 transition-colors border-border">
                          <TableCell className="text-sm font-medium text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString('en-GB')}</TableCell>
                          <TableCell className="font-bold text-foreground">{entry.medicine.name}</TableCell>
                          <TableCell className="font-bold text-muted-foreground">{batchLabel(entry.batch)}</TableCell>
                          <TableCell className="text-right font-bold text-foreground">{entry.quantity}</TableCell>
                          <TableCell className="text-sm font-medium text-muted-foreground">{entry.reason}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ImportPriceList
        isOpen={showPriceListModal}
        onClose={() => setShowPriceListModal(false)}
        onSuccess={async (count) => {
          toast.success(`${count} invoices imported & processed via AI successfully`);
          await loadAll();
        }}
      />

      {/* New Medicine Dialog: bottom sheet on phones, centred card on larger screens. */}
      {showNewMedicineDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !creatingMedicine) closeNewMedicineDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-medicine-title"
            className="w-full max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lg sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border sm:hidden" />
            <h3 id="new-medicine-title" className="text-xl font-bold text-foreground mb-4">Add New Medicine</h3>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateNewMedicine();
              }}
            >
              <div>
                <Label htmlFor="new-medicine-name">Medicine Name</Label>
                <Input
                  id="new-medicine-name"
                  value={newMedicineName}
                  onChange={(e) => setNewMedicineName(e.target.value)}
                  className="mt-1.5 h-11 rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                  placeholder="Enter medicine name"
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>
              <div>
                <Label htmlFor="new-medicine-company">Company</Label>
                <select
                  id="new-medicine-company"
                  value={newMedicineCompany}
                  onChange={(e) => setNewMedicineCompany(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.name}>
                      {company.name}
                    </option>
                  ))}
                  <option value="__new__">+ New company…</option>
                </select>
                {newMedicineCompany === '__new__' && (
                  <Input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="mt-2 h-11 rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                    placeholder="New company name"
                    autoComplete="off"
                    autoCapitalize="characters"
                  />
                )}
              </div>
              <div>
                <Label htmlFor="new-medicine-category">Category</Label>
                <select
                  id="new-medicine-category"
                  value={categories.includes(newMedicineCategory) ? newMedicineCategory : ''}
                  onChange={(e) => setNewMedicineCategory(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <Input
                  value={newMedicineCategory}
                  onChange={(e) => setNewMedicineCategory(e.target.value)}
                  className="mt-2 h-11 rounded-xl border-border bg-surface focus-visible:ring-primary/20"
                  placeholder="Or type a new category"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 rounded-xl"
                  onClick={closeNewMedicineDialog}
                  disabled={creatingMedicine}
                >
                  Cancel
                </Button>
                <Button type="submit" className="h-11 flex-1 rounded-xl" disabled={creatingMedicine}>
                  {creatingMedicine ? 'Creating...' : 'Add Medicine'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
