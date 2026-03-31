'use client';

import { useEffect, useState, useRef, KeyboardEvent } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
  packing?: string;
  gstPercent?: number;
}

const GST_OPTIONS = [
  { value: 5, label: '5%', category: 'Standard' },
  { value: 12, label: '12%', category: 'Proprietary' },
  { value: 18, label: '18%', category: 'Cosmetic' },
];

const CATEGORY_OPTIONS = [
  'Tablet', 'Capsule', 'Powder', 'Churna', 'Asav', 'Syrup',
  'Oil', 'Cream', 'Gel', 'Drops', 'Bhasma', 'Vati',
  'Chawanprash', 'Ointment', 'Juice', 'Guggulu', 'Other',
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
  medicines?: MedicineOption[];
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [rackLocations, setRackLocations] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const [isCreatingNewMedicine, setIsCreatingNewMedicine] = useState(false);
  const [batchesAdded, setBatchesAdded] = useState(0);
  const [lastAddedName, setLastAddedName] = useState('');

  // Refs for keyboard navigation (Tab flow)
  const companyRef = useRef<HTMLSelectElement>(null);
  const medicineRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const purchaseRateRef = useRef<HTMLInputElement>(null);
  const mrpRef = useRef<HTMLInputElement>(null);
  const packingRef = useRef<HTMLInputElement>(null);
  const rackRef = useRef<HTMLSelectElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

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

    setSelectedCompanyId('');
    setMedicineSearch('');
    setSelectedCategory('');
    setIsCreatingNewMedicine(false);
    setHighlightedIndex(-1);
    setBatchesAdded(0);
    setLastAddedName('');
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

    fetchCompanies();
    fetchRackLocations();

    // Auto-focus company dropdown when modal opens
    setTimeout(() => companyRef.current?.focus(), 150);
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMedicineDropdown(false);
        setHighlightedIndex(-1);
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
          setHighlightedIndex(-1);
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
    setIsCreatingNewMedicine(false);
    setSelectedCategory('');
    setFormData(c => ({ ...c, medicineId: '' }));
    setMedicineOptions([]);
    // Auto-focus medicine search after selecting company
    setTimeout(() => medicineRef.current?.focus(), 50);
  };

  const handleSelectMedicine = async (med: MedicineOption) => {
    setSelectedCategory(med.category || '');
    setIsCreatingNewMedicine(false);
    setFormData(c => ({ ...c, medicineId: med.id, mrp: '', packing: med.packing || '', gstPercent: med.gstPercent || 5 }));
    setMedicineSearch(med.name);
    setShowMedicineDropdown(false);
    setHighlightedIndex(-1);
    setError(e => ({ ...e, medicineId: '' }));

    // Auto-focus batch number after selecting medicine
    setTimeout(() => batchRef.current?.focus(), 50);

    // Auto-fill from last batch
    try {
      const res = await axios.get(`/api/medicines/${med.id}/last-mrp`);
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        setFormData(c => ({
          ...c,
          mrp: d.mrp || c.mrp,
          purchaseRate: d.purchaseRate || c.purchaseRate,
          packing: d.packing || c.packing,
          rackLocation: d.rackLocation || c.rackLocation,
        }));
      }
    } catch(e) { /* silent */ }
  };

  const handleCreateNewMedicine = () => {
    setIsCreatingNewMedicine(true);
    setFormData(c => ({ ...c, medicineId: '' }));
    setShowMedicineDropdown(false);
    setHighlightedIndex(-1);
    setError(e => ({ ...e, medicineId: '' }));
    // Focus batch number
    setTimeout(() => batchRef.current?.focus(), 50);
  };

  // Keyboard navigation for medicine dropdown (no useCallback to avoid stale closure)
  const handleMedicineKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showMedicineDropdown) {
      if (e.key === 'Enter' && formData.medicineId) {
        e.preventDefault();
        batchRef.current?.focus();
      }
      return;
    }

    const totalItems = medicineOptions.length + 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < medicineOptions.length) {
        handleSelectMedicine(medicineOptions[highlightedIndex]);
      } else if (highlightedIndex === medicineOptions.length) {
        handleCreateNewMedicine();
      } else if (medicineOptions.length === 1) {
        handleSelectMedicine(medicineOptions[0]);
      } else if (medicineOptions.length === 0) {
        handleCreateNewMedicine();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowMedicineDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  // Generic Enter key handler — pressing Enter on any input moves to next field
  const handleFieldEnter = (e: KeyboardEvent<HTMLInputElement>, nextRef: React.RefObject<HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef.current?.focus();
    }
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
    
    if (isCreatingNewMedicine) {
      if (!medicineSearch.trim() || medicineSearch.trim().length < 2) newErrors.medicineId = 'Medicine name is required (min 2 chars)';
      if (!selectedCategory) newErrors.category = 'Category is required for new medicine';
    } else {
      if (!formData.medicineId) newErrors.medicineId = 'Medicine is required — select from dropdown or create new';
    }
    
    if (!formData.batchNumber) newErrors.batchNumber = 'Batch Number is required';
    if (!formData.expiryDate) newErrors.expiryDate = 'Expiry Date is required';
    
    if (formData.stockQty === '' || Number(formData.stockQty) <= 0) newErrors.stockQty = 'Quantity must be greater than 0';
    if (formData.mrp === '' || Number(formData.mrp) <= 0) newErrors.mrp = 'MRP must be greater than 0';
    
    if (!formData.rackLocation) newErrors.rackLocation = 'Rack Location is required';

    setError(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      let medicineId = formData.medicineId;

      if (isCreatingNewMedicine && !medicineId) {
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);
        const companyName = selectedCompany?.name || '';

        const createRes = await axios.post('/api/medicines/search', {
          name: medicineSearch.trim().toUpperCase(),
          company: companyName,
          category: selectedCategory,
          hsn: '30049011',
          unit: 'strip',
          packing: formData.packing || '',
          gstPercent: Number(formData.gstPercent),
        });

        if (createRes.data.success && createRes.data.data?.id) {
          medicineId = createRes.data.data.id;
        } else {
          throw new Error(createRes.data.message || 'Failed to create medicine');
        }
      }

      await axios.post('/api/inventory/batches', {
        medicineId,
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

      await onSaved();

      // Track success
      const addedName = medicineSearch.trim();
      setBatchesAdded(prev => prev + 1);
      setLastAddedName(addedName);

      // Reset form for next entry — keep company, rack location, and GST
      const keepRack = formData.rackLocation;
      const keepGst = formData.gstPercent;
      setMedicineSearch('');
      setSelectedCategory('');
      setIsCreatingNewMedicine(false);
      setMedicineOptions([]);
      setHighlightedIndex(-1);
      setFormData({
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        stockQty: '',
        purchaseRate: '',
        mrp: '',
        packing: '',
        rackLocation: keepRack,
        gstPercent: keepGst,
      });
      setError({});

      // Auto-focus medicine search for next entry
      setTimeout(() => medicineRef.current?.focus(), 100);
    } catch (submitError: any) {
      setError({ global: submitError.response?.data?.message || submitError.message || 'Failed to add inventory' });
    } finally {
      setLoading(false);
    }
  };

  const defaultRacks = ['H1', 'H2', 'H3', 'H4', 'H5'];
  const displayRacks = rackLocations.length > 0 ? rackLocations.map(r => r.name) : defaultRacks;

  const isSubmitDisabled = loading || Object.entries(error).some(([k, v]) => k !== 'global' && !!v);

  const packingSuggestions = (
    PACKAGING_OPTIONS[selectedCategory] || 
    PACKAGING_OPTIONS[selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1).toLowerCase()] || 
    []
  );

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
                ref={companyRef}
                tabIndex={1}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedCompanyId) {
                    e.preventDefault();
                    medicineRef.current?.focus();
                  }
                }}
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
                ref={medicineRef}
                tabIndex={2}
                placeholder="Type 2 chars to search..."
                value={medicineSearch}
                onChange={(e) => {
                  setMedicineSearch(e.target.value);
                  setFormData(c => ({ ...c, medicineId: '' }));
                  setIsCreatingNewMedicine(false);
                  setShowMedicineDropdown(true);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleMedicineKeyDown}
                disabled={!selectedCompanyId}
                className={`w-full ${isCreatingNewMedicine ? 'border-blue-500 ring-1 ring-blue-200' : ''}`}
                autoComplete="off"
              />
              {isSearchingMedicines && (
                <div className="absolute right-3 top-9 h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-white" />
              )}
              {isCreatingNewMedicine && (
                <span className="text-xs text-blue-600 font-medium">✨ New medicine will be created</span>
              )}
              {showMedicineDropdown && medicineSearch.length >= 2 && medicineOptions.length > 0 && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {medicineOptions.map((med, idx) => (
                    <div 
                      key={med.id} 
                      className={`px-4 py-2 text-sm cursor-pointer border-b last:border-0 border-gray-100 transition-colors ${
                        idx === highlightedIndex ? 'bg-emerald-100 text-emerald-900' : 'hover:bg-emerald-50'
                      }`}
                      onClick={() => handleSelectMedicine(med)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      <div className="font-medium text-emerald-800">{med.name}</div>
                      <div className="text-xs text-gray-500">{med.category}{med.packing ? ` • ${med.packing}` : ''}{med.hsn ? ` • HSN: ${med.hsn}` : ''}</div>
                    </div>
                  ))}
                  <div 
                    className={`px-4 py-2 text-sm cursor-pointer border-t border-gray-200 flex items-center gap-2 transition-colors ${
                      highlightedIndex === medicineOptions.length ? 'bg-blue-100 text-blue-900' : 'bg-gray-50 hover:bg-blue-50'
                    }`}
                    onClick={handleCreateNewMedicine}
                    onMouseEnter={() => setHighlightedIndex(medicineOptions.length)}
                  >
                    <Plus className="h-3.5 w-3.5 text-blue-600" />
                    <span className="font-medium text-blue-700">Create &quot;{medicineSearch.trim().toUpperCase()}&quot; as new medicine</span>
                  </div>
                </div>
              )}
              {showMedicineDropdown && medicineSearch.length >= 2 && medicineOptions.length === 0 && !isSearchingMedicines && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="px-4 py-3 text-sm text-amber-700 bg-amber-50 border-b border-amber-100">
                    No existing medicines found for &quot;{medicineSearch}&quot;
                  </div>
                  <div 
                    className={`px-4 py-3 text-sm cursor-pointer flex items-center gap-2 transition-colors ${
                      highlightedIndex === 0 ? 'bg-blue-100' : 'hover:bg-blue-50'
                    }`}
                    onClick={handleCreateNewMedicine}
                    onMouseEnter={() => setHighlightedIndex(0)}
                  >
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-blue-700">Create &quot;{medicineSearch.trim().toUpperCase()}&quot; as new medicine</span>
                  </div>
                </div>
              )}
              {error.medicineId && <span className="text-xs text-red-600 font-medium">{error.medicineId}</span>}
            </div>
          </div>

          {/* Category selector — shown when creating a new medicine */}
          {isCreatingNewMedicine && (
            <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <Label className="text-blue-800 font-semibold text-xs uppercase tracking-wider">Category for new medicine *</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    tabIndex={3}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setError(e => ({ ...e, category: '' }));
                      // Auto-focus batch after picking category
                      setTimeout(() => batchRef.current?.focus(), 50);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selectedCategory === cat
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'border-blue-200 bg-white text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {error.category && <span className="text-xs text-red-600 font-medium">{error.category}</span>}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Batch Number *</Label>
              <Input
                ref={batchRef}
                tabIndex={4}
                placeholder="Enter batch identifier"
                value={formData.batchNumber}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, batchNumber: e.target.value }));
                  setError(er => ({...er, batchNumber: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, expiryRef)}
              />
              {error.batchNumber && <span className="text-xs text-red-600 font-medium">{error.batchNumber}</span>}
            </div>
            
            <div className="grid gap-2">
              <Label>Expiry Date *</Label>
              <Input
                ref={expiryRef}
                tabIndex={5}
                type="date"
                value={formData.expiryDate}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, expiryDate: e.target.value }));
                  setError(er => ({...er, expiryDate: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, qtyRef)}
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
                ref={qtyRef}
                tabIndex={6}
                type="number"
                min="1"
                placeholder="Enter quantity"
                value={formData.stockQty}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, stockQty: e.target.value }));
                  setError(er => ({...er, stockQty: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, purchaseRateRef)}
              />
              {error.stockQty && <span className="text-xs text-red-600 font-medium">{error.stockQty}</span>}
            </div>
            
            <div className="grid gap-2">
              <Label>Purchase Rate</Label>
              <Input
                ref={purchaseRateRef}
                tabIndex={7}
                type="number"
                step="0.01"
                placeholder="Enter purchase rate"
                value={formData.purchaseRate}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, purchaseRate: e.target.value }));
                  setError(er => ({...er, purchaseRate: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, mrpRef)}
              />
              {error.purchaseRate && <span className="text-xs text-red-600 font-medium">{error.purchaseRate}</span>}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>MRP *</Label>
              <Input
                ref={mrpRef}
                tabIndex={8}
                type="number"
                step="0.01"
                placeholder="Enter MRP"
                value={formData.mrp}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, mrp: e.target.value }));
                  setError(er => ({...er, mrp: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, packingRef)}
              />
              {error.mrp && <span className="text-xs text-red-600 font-medium">{error.mrp}</span>}
            </div>
            <div className="grid gap-2">
              <Label>Packing</Label>
              <Input
                ref={packingRef}
                tabIndex={9}
                placeholder="e.g. 10x10 Strips, 100ml"
                list="packing-options"
                value={formData.packing}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, packing: e.target.value }));
                }}
                onKeyDown={(e) => handleFieldEnter(e, rackRef)}
              />
              <datalist id="packing-options">
                {packingSuggestions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            
            <div className="grid gap-2">
              <Label>Rack Location *</Label>
              <select
                ref={rackRef}
                tabIndex={10}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={formData.rackLocation}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, rackLocation: e.target.value }));
                  setError(er => ({...er, rackLocation: ''}));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitRef.current?.focus();
                  }
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
                {GST_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.value}
                    type="button"
                    tabIndex={11 + idx}
                    onClick={() =>
                      setFormData((c) => ({ ...c, gstPercent: Number(opt.value) }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setFormData((c) => ({ ...c, gstPercent: Number(opt.value) }));
                        submitRef.current?.focus();
                      }
                    }}
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

        {batchesAdded > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold">{batchesAdded}</span>
            <span className="text-emerald-800 font-medium">
              {batchesAdded === 1 ? 'batch' : 'batches'} added{lastAddedName ? ` — last: ${lastAddedName}` : ''}
            </span>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading} tabIndex={15}>
            {batchesAdded > 0 ? `Done (${batchesAdded} added)` : 'Cancel'}
          </Button>
          <Button 
            ref={submitRef}
            tabIndex={14}
            onClick={handleSubmit} 
            disabled={isSubmitDisabled} 
            className="bg-emerald-600 hover:bg-emerald-700"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            {loading 
              ? (isCreatingNewMedicine ? 'Creating Medicine & Batch...' : 'Committing Batch...') 
              : (isCreatingNewMedicine ? 'Create Medicine & Add Batch' : 'Add & Next →')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
