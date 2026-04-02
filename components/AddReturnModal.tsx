'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { toast } from 'sonner';
import { Search, ChevronRight, ArrowLeft, Package, User, Calendar, Receipt, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3;

export default function AddReturnModal({ isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [type, setType] = useState('CUSTOMER');

  // Step 1: Sale Selection
  const [saleSearch, setSaleSearch] = useState('');
  const [sales, setSales] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<any>(null);

  // Step 2: Item Selection
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Step 3: Final Details
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Legacy/Supplier Mode Dependencies
  const [medicines, setMedicines] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [mrp, setMrp] = useState('');

  useEffect(() => {
    if (isOpen) {
      resetForm();
      if (type === 'SUPPLIER') loadManualDependencies();
    }
  }, [isOpen, type]);

  const resetForm = () => {
    setStep(1);
    setSelectedSale(null);
    setSelectedItem(null);
    setSales([]);
    setSaleItems([]);
    setQuantity('');
    setReason('');
    setNotes('');
    setSaleSearch('');
    setError('');
  };

  const loadManualDependencies = async () => {
    try {
      const [medRes, compRes] = await Promise.all([
        axios.get('/api/returns/medicines'),
        axios.get('/api/companies')
      ]);
      setMedicines(medRes.data.data || []);
      setCompanies(compRes.data.data || []);
    } catch (err) {
      console.error('Failed to load modal dependencies:', err);
    }
  };

  const searchSales = async () => {
    if (!saleSearch.trim()) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/sales/search?query=${encodeURIComponent(saleSearch)}`);
      setSales(res.data.data || []);
    } catch (err) {
      toast.error('Failed to search sales');
    } finally {
      setLoading(false);
    }
  };

  const selectSale = async (sale: any) => {
    setSelectedSale(sale);
    setLoading(true);
    try {
      const res = await axios.get(`/api/sales/${sale.id}/items`);
      setSaleItems(res.data.data || []);
      setStep(2);
    } catch (err) {
      toast.error('Failed to load sale items');
    } finally {
      setLoading(false);
    }
  };

  const selectItem = (item: any) => {
    setSelectedItem(item);
    setStep(3);
  };

  const handleSubmit = async () => {
    // Validation
    if (type === 'CUSTOMER') {
      if (!selectedItem || !quantity || !reason) {
        setError('Please fill all required fields');
        return;
      }
      if (Number(quantity) > selectedItem.quantity) {
        setError(`Quantity cannot exceed original sold units (${selectedItem.quantity})`);
        return;
      }
    } else {
      if (!medicineId || !expiryDate || !mrp || !quantity || !reason || !companyId) {
        setError('Please fill all required (*) fields');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const payload = type === 'CUSTOMER' ? {
        type: 'CUSTOMER',
        medicineId: selectedItem.medicineId,
        batchId: selectedItem.batchId,
        batchNumber: selectedItem.batch.batchNumber,
        expiryDate: selectedItem.batch.expiryDate,
        mrp: Number(selectedItem.mrp),
        quantity: Number(quantity),
        reason,
        notes,
        saleId: selectedSale.id,
        saleItemId: selectedItem.id,
        companyId: '' // We don't strictly need it if we have batchId, but logic might expect it
      } : {
        type: 'SUPPLIER',
        companyId,
        medicineId,
        batchNumber,
        expiryDate,
        mrp: Number(mrp),
        quantity: Number(quantity),
        reason,
        notes
      };

      const response = await axios.post('/api/returns', payload);

      if (response.data.success) {
        toast.success('Return processed successfully!');
        onSuccess();
        onClose();
      } else {
        setError(response.data.message || 'Failed to process return');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Access Denied / Stock Exception');
      toast.error('Transaction Failed', { description: err.response?.data?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl rounded-[32px] border-border bg-surface p-0 overflow-hidden shadow-2xl">
        <div className="bg-primary/5 p-6 border-b border-border">
          <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
            <Badge variant="outline" className="bg-background text-primary border-primary/20 uppercase tracking-widest text-[10px]">
              {type}
            </Badge>
            Process New Return
          </DialogTitle>
          <div className="mt-4 flex items-center gap-2">
             <Button 
                variant={type === 'CUSTOMER' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full font-bold px-6 h-8 text-[11px] uppercase tracking-wider"
                onClick={() => setType('CUSTOMER')}
             >
                Customer Return
             </Button>
             <Button 
                variant={type === 'SUPPLIER' ? 'default' : 'outline'}
                size="sm"
                className="rounded-full font-bold px-6 h-8 text-[11px] uppercase tracking-wider"
                onClick={() => setType('SUPPLIER')}
             >
                Supplier Return
             </Button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-2xl text-xs text-danger font-black flex items-center gap-2">
              <Info className="h-4 w-4" /> {error}
            </div>
          )}

          {type === 'CUSTOMER' ? (
            <div className="space-y-6">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Search Sale</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search Invoice # or Customer Name..."
                          value={saleSearch}
                          onChange={(e) => setSaleSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && searchSales()}
                          className="pl-10 rounded-2xl border-border bg-background h-12 font-medium"
                        />
                      </div>
                      <Button onClick={searchSales} disabled={loading} className="rounded-2xl h-12 w-12 p-0 bg-primary text-background">
                        <Search className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-border bg-background">
                    {sales.length > 0 ? (
                      <div className="divide-y divide-border">
                        {sales.map(sale => (
                          <button 
                            key={sale.id}
                            onClick={() => selectSale(sale)}
                            className="w-full p-4 flex items-center justify-between hover:bg-primary/5 transition-colors text-left group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-xl bg-surface flex items-center justify-center text-primary border border-border group-hover:border-primary/20 transition-colors shadow-soft">
                                <Receipt className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="text-sm font-black text-foreground">{sale.invoiceNumber}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                                    <User className="h-3 w-3" /> {sale.customer?.name || 'Cash Customer'}
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                                    <Calendar className="h-3 w-3" /> {format(new Date(sale.createdAt), 'dd MMM yyyy')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-foreground">₹{Number(sale.grandTotal).toLocaleString('en-IN')}</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-all group-hover:translate-x-0.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <p className="text-sm font-bold text-muted-foreground">Search by Invoice # or Customer to find sales</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Selected Invoice</p>
                      <p className="text-sm font-black text-primary">{selectedSale.invoiceNumber}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="rounded-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                      <ArrowLeft className="h-3 w-3 mr-1" /> Change Sale
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Item to Return</Label>
                    <div className="rounded-2xl border border-border bg-background divide-y divide-border overflow-hidden">
                      {saleItems.map(item => (
                        <button 
                          key={item.id}
                          onClick={() => selectItem(item)}
                          className="w-full p-4 flex items-center justify-between hover:bg-primary/5 transition-colors text-left group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-surface flex items-center justify-center text-primary border border-border group-hover:border-primary/20 transition-colors shadow-soft">
                              <Package className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-foreground">{item.medicine.name}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Batch: {item.batch.batchNumber}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                  Qty: {item.quantity} Sold
                                </span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground">
                       <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Returning Item from {selectedSale.invoiceNumber}</p>
                      <p className="text-sm font-black text-foreground">{selectedItem.medicine.name} — <span className="text-primary">{selectedItem.batch.batchNumber}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 p-4 rounded-2xl border border-border bg-surface-muted/30">
                       <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Sold Price (MRP)</Label>
                       <p className="text-lg font-black text-foreground">₹{Number(selectedItem.mrp).toFixed(2)}</p>
                    </div>
                    <div className="space-y-1.5 p-4 rounded-2xl border border-border bg-surface-muted/30">
                       <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Sold Quantity</Label>
                       <p className="text-lg font-black text-foreground">{selectedItem.quantity} Units</p>
                    </div>

                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Return Quantity *</Label>
                      <Input 
                        type="number"
                        max={selectedItem.quantity}
                        min={1}
                        placeholder={`Max ${selectedItem.quantity}`}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="rounded-xl border-border bg-background h-11 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Return Reason *</Label>
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                      >
                        <option value="" disabled>Select Reason</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Expired">Expired</option>
                        <option value="Wrong Medicine">Wrong Medicine</option>
                        <option value="Customer Return">Customer Return</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-2 col-span-2">
                       <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 text-surface-action-primary-default">Extra Notes</Label>
                       <Input 
                        placeholder="Optional details about this return..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="rounded-xl border-border bg-background h-11 focus:ring-primary/20"
                       />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
               <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Company Name *</Label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="" disabled>Select Company</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Medicine Name *</Label>
                <select
                  value={medicineId}
                  onChange={(e) => setMedicineId(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="" disabled>Select Medicine</option>
                  {medicines.filter(m => !companyId || m.companyId === companyId).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Batch Number</Label>
                <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className="rounded-xl h-11" placeholder="e.g. B-101" />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Expiry Date *</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="rounded-xl h-11" />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">MRP (₹) *</Label>
                <Input type="number" step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} className="rounded-xl h-11" placeholder="0.00" />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Quantity *</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl h-11" placeholder="0" />
              </div>

              <div className="col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Reason *</Label>
                <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                      >
                        <option value="" disabled>Select Reason</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Expired">Expired</option>
                        <option value="Wrong Medicine">Wrong Medicine</option>
                        <option value="Supplier Replacement">Supplier Replacement</option>
                        <option value="Other">Other</option>
                      </select>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-surface-muted/30 border-t border-border flex items-center justify-between gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading} className="rounded-2xl font-bold bg-background h-12 px-8">
            Cancel
          </Button>
          <div className="flex gap-3">
            {step > 1 && type === 'CUSTOMER' && (
              <Button variant="outline" onClick={() => setStep(step - 1 as Step)} className="rounded-2xl font-bold bg-background h-12 shadow-soft">
                Back
              </Button>
            )}
            <Button 
              onClick={handleSubmit} 
              disabled={loading || (type === 'CUSTOMER' && step < 3)}
              className="rounded-2xl bg-primary hover:bg-primary/90 text-background font-black tracking-widest uppercase h-12 px-8 shadow-soft"
            >
              {loading ? 'Processing...' : step === 3 || type === 'SUPPLIER' ? 'Confirm Return' : 'Next Step'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
