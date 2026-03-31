'use client';

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
  gstPercent?: number;
}

const GST_OPTIONS = [
  { value: 5, label: '5%', category: 'Standard' },
  { value: 12, label: '12%', category: 'Proprietary' },
  { value: 18, label: '18%', category: 'Cosmetic' },
];

const PACKAGING_OPTIONS: Record<string, string[]> = {
  Tablet: ['10 Tab', '20 Tab', '30 Tab', '40 Tab', '60 Tab', '80 Tab', '100 Tab'],
  Capsule: ['10 Cap', '20 Cap', '30 Cap', '60 Cap'],
  Powder: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Churna: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Asav: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Syrup: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Oil: ['50 ml', '100 ml', '200 ml', '500 ml'],
  Cream: ['15 gm', '30 gm', '50 gm'],
  Gel: ['15 gm', '30 gm', '50 gm'],
  Drops: ['10 ml', '15 ml', '30 ml'],
  Bhasma: ['10 gm', '25 gm', '50 gm'],
  Vati: ['10 Tab', '20 Tab', '30 Tab', '60 Tab'],
  Chawanprash: ['250 gm', '500 gm', '1 kg'],
  Other: [],
};

interface AddInventoryModalProps {
  isOpen: boolean;
  medicines?: MedicineOption[]; // Kept for backwards compatibility if parent passes it
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function AddInventoryModal({
  isOpen,
  onClose,
  onSaved,
}: AddInventoryModalProps) {
  
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineOptions, setMedicineOptions] = useState<MedicineOption[]>([]);
  const [isSearchingMedicines, setIsSearchingMedicines] = useState(false);
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [rackLocations, setRackLocations] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  const [formData, setFormData] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    stockQty: '' as number | string,
    purchaseRate: '' as number | string,
    mrp: '' as number | string,
    packing: '',
    rackLocation: '',
    gstPercent: 5,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!isOpen) return;

    // Reset Form completely
    setSelectedCompanyId('');
    setMedicineSearch('');
    setFormData({
      medicineId: '',
      batchNumber: '',
      expiryDate: '',
      stockQty: '',
      purchaseRate: '',
      mrp: '',
      packing: '',
      rackLocation: '',
      gstPercent: 5,
    });
    setError({});
    setShowMedicineDropdown(false);

    // Initial Fetch Core Metadata
    fetchCompanies();
    fetchRackLocations();
  }, [isOpen]);

  // Click outside to close medicine dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMedicineDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/companies');
      if (res.data.success) setCompanies(res.data.data);
    } catch (e) {
      console.error('Failed to fetch companies', e);
    }
  };

  const fetchRackLocations = async () => {
    try {
      const res = await axios.get('/api/settings/rack-locations');
      if (res.data.success) setRackLocations(res.data.data);
    } catch (e) {
      console.error('Failed to fetch racks', e);
    }
  };

  // Debounced Medicine Search Hook
  useEffect(() => {
    if (!selectedCompanyId || medicineSearch.length < 2) {
      setMedicineOptions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingMedicines(true);
      try {
        const res = await axios.get(`/api/medicines/search?company=${selectedCompanyId}&q=${medicineSearch}`);
        if (res.data.success) {
          setMedicineOptions(res.data.data);
          setShowMedicineDropdown(true);
        }
      } catch (e) {
        console.error('Search timeout', e);
      } finally {
        setIsSearchingMedicines(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [medicineSearch, selectedCompanyId]);

  const handleCompanyChange = (val: string) => {
    setSelectedCompanyId(val);
    setMedicineSearch('');
    setFormData(c => ({ ...c, medicineId: '' }));
    setMedicineOptions([]);
  };

  const handleSelectMedicine = async (med: MedicineOption) => {
    setSelectedCategory(med.category || '');
    setFormData(c => ({ ...c, medicineId: med.id, mrp: '', packing: '', gstPercent: med.gstPercent || 5 }));
    setMedicineSearch(med.name);
    setShowMedicineDropdown(false);
    setError(e => ({ ...e, medicineId: '' }));

    // Auto-fill MRP from historical batch
    try {
      const res = await axios.get(`/api/medicines/${med.id}/last-mrp`);
      if (res.data.success && res.data.data.mrp) {
        setFormData(c => ({ ...c, mrp: res.data.data.mrp }));
      }
    } catch(e) { /* silent fail on UX enhancement */ }
  };

  const isExpiringSoon = () => {
    if (!formData.expiryDate) return false;
    const expiry = new Date(formData.expiryDate);
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    return expiry < threeMonthsFromNow;
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!selectedCompanyId) newErrors.companyId = 'Company is required';
    if (!formData.medicineId) newErrors.medicineId = 'Medicine is required';
    if (!formData.batchNumber) newErrors.batchNumber = 'Batch Number is required';
    if (!formData.expiryDate) newErrors.expiryDate = 'Expiry Date is required';
    
    if (formData.stockQty === '' || Number(formData.stockQty) <= 0) newErrors.stockQty = 'Quantity must be greater than 0';
    // purchaseRate is now optional
    if (formData.mrp === '' || Number(formData.mrp) <= 0) newErrors.mrp = 'MRP must be greater than 0';
    
    if (!formData.rackLocation) newErrors.rackLocation = 'Rack Location is required';

    setError(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      await axios.post('/api/inventory/batches', {
        medicineId: formData.medicineId,
        batchNumber: formData.batchNumber,
        expiryDate: formData.expiryDate,
        stockQty: Number(formData.stockQty),
        mrp: Number(formData.mrp),
        purchaseRate: formData.purchaseRate === '' ? null : Number(formData.purchaseRate),
        sellingRate: Number(formData.mrp),
        packing: formData.packing,
        rackLocation: formData.rackLocation,
        gstPercent: Number(formData.gstPercent),
      });

      await onSaved(); // Specifically relying on the UI framework to re-trigger parent loadInventory()
      onClose();
    } catch (submitError: any) {
      setError({ global: submitError.response?.data?.message || 'Failed to add inventory' });
    } finally {
      setLoading(false);
    }
  };

  // Determine which rack locations to map
  const defaultRacks = ['H1', 'H2', 'H3', 'H4', 'H5'];
  const displayRacks = rackLocations.length > 0 ? rackLocations.map(r => r.name) : defaultRacks;

  const isSubmitDisabled = loading || Object.keys(error).filter(k => k !== 'global').length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Add Inventory</DialogTitle>
        </DialogHeader>

        {error.global && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.global}
          </div>
        )}

        <div className="grid gap-4 py-2">
          
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Company Name *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
              >
                <option value="" disabled>Select Company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {error.companyId && <span className="text-xs text-red-600 font-medium">{error.companyId}</span>}
            </div>

            <div className="grid gap-2 relative" ref={dropdownRef}>
              <Label>Medicine Name *</Label>
              <Input
                placeholder="Type 2 characters to search..."
                value={medicineSearch}
                onChange={(e) => {
                  setMedicineSearch(e.target.value);
                  setFormData(c => ({ ...c, medicineId: '' }));
                  setShowMedicineDropdown(true);
                }}
                disabled={!selectedCompanyId}
                className="w-full"
                autoComplete="off"
              />
              {isSearchingMedicines && (
                <div className="absolute right-3 top-9 h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-white" />
              )}
              {showMedicineDropdown && medicineSearch.length >= 2 && medicineOptions.length > 0 && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {medicineOptions.map(med => (
                    <div 
                      key={med.id} 
                      className="px-4 py-2 text-sm hover:bg-emerald-50 cursor-pointer border-b last:border-0 border-gray-100"
                      onClick={() => handleSelectMedicine(med)}
                    >
                      <div className="font-medium text-emerald-800">{med.name}</div>
                      <div className="text-xs text-gray-500">{med.category} {med.hsn && `• HSN: ${med.hsn}`}</div>
                    </div>
                  ))}
                </div>
              )}
              {error.medicineId && <span className="text-xs text-red-600 font-medium">{error.medicineId}</span>}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Batch Number *</Label>
              <Input
                placeholder="Enter batch identifier"
                value={formData.batchNumber}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, batchNumber: e.target.value }));
                  setError(er => ({...er, batchNumber: ''}));
                }}
              />
              {error.batchNumber && <span className="text-xs text-red-600 font-medium">{error.batchNumber}</span>}
            </div>
            
            <div className="grid gap-2">
              <Label>Expiry Date *</Label>
              <Input
                type="date"
                value={formData.expiryDate}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, expiryDate: e.target.value }));
                  setError(er => ({...er, expiryDate: ''}));
                }}
              />
              {error.expiryDate && <span className="text-xs text-red-600 font-medium">{error.expiryDate}</span>}
              {isExpiringSoon() && !error.expiryDate && (
                <div className="mt-1 flex items-start text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded w-full">
                  ⚠️ This batch expires soon - are you sure you want to add it?
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter quantity"
                value={formData.stockQty}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, stockQty: e.target.value }));
                  setError(er => ({...er, stockQty: ''}));
                }}
              />
              {error.stockQty && <span className="text-xs text-red-600 font-medium">{error.stockQty}</span>}
            </div>
            
            <div className="grid gap-2">
              <Label>Purchase Rate</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter purchase rate"
                value={formData.purchaseRate}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, purchaseRate: e.target.value }));
                  setError(er => ({...er, purchaseRate: ''}));
                }}
              />
              {error.purchaseRate && <span className="text-xs text-red-600 font-medium">{error.purchaseRate}</span>}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>MRP *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter MRP"
                value={formData.mrp}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, mrp: e.target.value }));
                  setError(er => ({...er, mrp: ''}));
                }}
              />
              {error.mrp && <span className="text-xs text-red-600 font-medium">{error.mrp}</span>}
            </div>
            <div className="grid gap-2">
              <Label>Packing</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formData.packing}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, packing: e.target.value }));
                }}
              >
                <option value="">Select</option>
                {(PACKAGING_OPTIONS[selectedCategory] || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            
            <div className="grid gap-2">
              <Label>Rack Location *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formData.rackLocation}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, rackLocation: e.target.value }));
                  setError(er => ({...er, rackLocation: ''}));
                }}
              >
                <option value="" disabled>Select Rack Location</option>
                {displayRacks.map(rack => (
                  <option key={rack} value={rack}>{rack}</option>
                ))}
              </select>
              {error.rackLocation && <span className="text-xs text-red-600 font-medium">{error.rackLocation}</span>}
            </div>
            
            <div className="grid gap-2 sm:col-span-2">
              <Label>GST Rate *</Label>
              <div className="flex gap-2">
                {GST_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setFormData((c) => ({ ...c, gstPercent: Number(opt.value) }))
                    }
                    className={`flex-1 flex flex-col items-center justify-center rounded-md border p-2 py-3 transition-all ${
                      Number(formData.gstPercent) === Number(opt.value)
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-input bg-background text-muted-foreground hover:bg-emerald-50'
                    }`}
                  >
                    <span className="text-sm font-bold">{opt.label}</span>
                    <span className="text-[10px] opacity-80 font-normal">{opt.category}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitDisabled} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? 'Committing Batch...' : 'Add Required Batch Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
