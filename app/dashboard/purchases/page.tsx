'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FileScan, Plus, Printer, RefreshCw, RotateCcw } from 'lucide-react';
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
}

interface PurchaseItemForm {
  tempId: string;
  medicineId: string;
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
});

export default function PurchasesPage() {
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState<PurchaseStats | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scanPreview, setScanPreview] = useState<ScanPreviewItem[]>([]);
  const [scanSummary, setScanSummary] = useState({
    matched: 0,
    possible: 0,
    newItems: 0,
  });
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
    void loadAll();
  }, []);

  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timer = setTimeout(() => {
      setMessage('');
      setError('');
    }, 4000);

    return () => clearTimeout(timer);
  }, [message, error]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [statsResponse, suppliersResponse, medicinesResponse, historyResponse, returnsResponse] =
        await Promise.all([
          axios.get('/api/purchases', { params: { view: 'stats' } }),
          axios.get('/api/suppliers', { params: { limit: 200 } }),
          axios.get('/api/medicines/search', { params: { query: '', limit: 200 } }),
          axios.get('/api/purchases'),
          axios.get('/api/purchases/returns'),
        ]);

      if (statsResponse.data.success) {
        setStats(statsResponse.data.data);
      }
      if (suppliersResponse.data.success) {
        setSuppliers(suppliersResponse.data.data);
      }
      if (medicinesResponse.data.success) {
        setMedicines(medicinesResponse.data.data);
      }
      if (historyResponse.data.success) {
        setHistory(historyResponse.data.data);
      }
      if (returnsResponse.data.success) {
        setReturns(returnsResponse.data.data);
      }
    } catch (loadError) {
      console.error('Failed to load purchases page:', loadError);
      setError('Failed to load purchases data');
    } finally {
      setLoading(false);
    }
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
    setError('');

    try {
      if (!purchaseForm.supplierId || !purchaseForm.invoiceNumber.trim()) {
        setError('Supplier and invoice number are required.');
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
        setError('Please fill medicine, batch, expiry, quantity, rate, and MRP for all rows.');
        return;
      }

      const response = await axios.post('/api/purchases', {
        ...purchaseForm,
        items: purchaseForm.items.map(({ tempId, ...item }) => item),
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save purchase');
      }

      setMessage(response.data.message || 'Purchase saved successfully');
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
      await loadAll();
    } catch (saveError) {
      const messageText = axios.isAxiosError(saveError)
        ? saveError.response?.data?.message
        : 'Failed to save purchase';
      setError(messageText || 'Failed to save purchase');
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
      setError('Failed to load purchase detail');
    }
  };

  const handleCreateReturn = async () => {
    try {
      const response = await axios.post('/api/purchases/returns', returnForm);
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create purchase return');
      }

      setMessage(response.data.message || 'Purchase return recorded successfully');
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
      setError(messageText || 'Failed to create purchase return');
    }
  };

  const handleScanInvoice = async (file: File | null) => {
    if (!file) {
      return;
    }

    setScanning(true);
    setError('');

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
      setScanSummary({ matched, possible, newItems });
      setMessage('Invoice scanned. Please review and apply the results.');
    } catch (scanError) {
      const messageText = axios.isAxiosError(scanError)
        ? scanError.response?.data?.message
        : 'Failed to scan invoice';
      setError(messageText || 'Failed to scan invoice');
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
      })),
    }));

    setScanPreview([]);
    setScanSummary({ matched: 0, possible: 0, newItems: 0 });
    setAppliedScanMeta(meta);
    setMessage('OCR results applied to purchase form. Please verify and save.');
  };

  const discardScanResults = () => {
    setScanPreview([]);
    setScanSummary({ matched: 0, possible: 0, newItems: 0 });
    setAppliedScanMeta({});
    setMessage('OCR results discarded.');
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading purchases...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Purchases</h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture distributor invoices, increase stock, and manage supplier returns.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={() => void loadAll()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
          >
            <FileScan className="h-4 w-4" />
            {scanning ? 'Scanning Invoice...' : 'Upload Distributor Invoice'}
          </Button>
          <Button className="gap-2" onClick={addPurchaseRow}>
            <Plus className="h-4 w-4" />
            New Purchase Row
          </Button>
        </div>
      </div>

      <input
        ref={scanInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          void handleScanInvoice(file);
          event.target.value = '';
        }}
      />

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {stats ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Today Purchases</CardTitle>
              <CardDescription className="text-2xl font-semibold text-slate-900">
                {stats.todayPurchases}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Month Purchases</CardTitle>
              <CardDescription className="text-2xl font-semibold text-slate-900">
                {stats.monthPurchases}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Pending Invoices</CardTitle>
              <CardDescription className="text-2xl font-semibold text-slate-900">
                {stats.pendingInvoices}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">Low Stock</CardTitle>
              <CardDescription className="text-2xl font-semibold text-slate-900">
                {stats.lowStockMedicines}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Tabs defaultValue="new" className="space-y-6">
        <TabsList className="grid w-full rounded-2xl bg-slate-100 p-1 md:grid-cols-3">
          <TabsTrigger value="new" className="rounded-xl">
            New Purchase
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl">
            Purchase History
          </TabsTrigger>
          <TabsTrigger value="returns" className="rounded-xl">
            Returns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Create Purchase</CardTitle>
              <CardDescription>Enter distributor invoice details and stock items.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {scanPreview.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-700">
                  <div className="font-semibold text-amber-800">OCR Review Required</div>
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
                  <div className="mt-2 text-xs text-amber-700">
                    Review possible or new items after applying. You can choose the correct medicine for each row.
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        invoiceDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>GST Type</Label>
                  <Input
                    value={purchaseForm.gstType}
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
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                    onChange={(event) =>
                      setPurchaseForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Free</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead>Rack</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseForm.items.map((item) => {
                      const meta = appliedScanMeta[item.tempId];
                      return (
                      <TableRow key={item.tempId}>
                        <TableCell>
                          <select
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                            value={item.medicineId}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'medicineId', event.target.value)
                            }
                          >
                            <option value="">Select medicine</option>
                            {medicines.map((medicine) => (
                              <option key={medicine.id} value={medicine.id}>
                                {medicine.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          {meta ? (
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                meta.status === 'matched'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : meta.status === 'possible'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {meta.status}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">Manual</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.batchNumber}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'batchNumber', event.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiryDate}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'expiryDate', event.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={(event) =>
                              handlePurchaseItemChange(
                                item.tempId,
                                'quantity',
                                Number(event.target.value)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.freeQty}
                            onChange={(event) =>
                              handlePurchaseItemChange(
                                item.tempId,
                                'freeQty',
                                Number(event.target.value)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.purchaseRate}
                            onChange={(event) =>
                              handlePurchaseItemChange(
                                item.tempId,
                                'purchaseRate',
                                Number(event.target.value)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.mrp}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'mrp', Number(event.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.discount}
                            onChange={(event) =>
                              handlePurchaseItemChange(
                                item.tempId,
                                'discount',
                                Number(event.target.value)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            value={item.gst}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'gst', Number(event.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.rackLocation}
                            onChange={(event) =>
                              handlePurchaseItemChange(item.tempId, 'rackLocation', event.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePurchaseRow(item.tempId)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-end gap-4 md:flex-row md:items-center md:justify-between">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Subtotal: <span className="font-semibold text-slate-900">₹{totals.subtotal.toFixed(2)}</span>
                  {' · '}
                  Discount: <span className="font-semibold text-slate-900">₹{totals.discountTotal.toFixed(2)}</span>
                  {' · '}
                  GST: <span className="font-semibold text-slate-900">₹{totals.gstTotal.toFixed(2)}</span>
                  {' · '}
                  Grand Total:{' '}
                  <span className="font-semibold text-slate-900">₹{totals.grandTotal.toFixed(2)}</span>
                </div>
                <Button className="gap-2" onClick={handleSavePurchase} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Purchase'}
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Purchase History</CardTitle>
              <CardDescription>Track invoices and quick filters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Input
                  placeholder="Search invoice number"
                  value={filters.invoice}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, invoice: event.target.value }))
                  }
                />
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-slate-500">
                          No purchases found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHistory.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell>{purchase.invoiceNumber}</TableCell>
                          <TableCell>{purchase.supplier.name}</TableCell>
                          <TableCell>{purchase.status}</TableCell>
                          <TableCell>{purchase.paymentType}</TableCell>
                          <TableCell className="text-right">₹{purchase.totalAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => void handleLoadPurchaseDetail(purchase.id)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {selectedPurchase ? (
                <Card className="rounded-2xl border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">Create Return</CardTitle>
                    <CardDescription>Selected invoice: {selectedPurchase.invoiceNumber}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                            {item.medicine.name} · {item.batch.batchNumber}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min={1}
                        value={returnForm.quantity}
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
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Purchase Returns</CardTitle>
              <CardDescription>Track supplier returns logged in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500">
                          No returns recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      returns.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(entry.createdAt).toLocaleDateString('en-GB')}</TableCell>
                          <TableCell>{entry.medicine.name}</TableCell>
                          <TableCell>{entry.batch.batchNumber}</TableCell>
                          <TableCell className="text-right">{entry.quantity}</TableCell>
                          <TableCell>{entry.reason}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
