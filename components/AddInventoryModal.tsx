'use client';

import { useEffect, useState, useRef, KeyboardEvent } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Copy, Clock } from 'lucide-react';

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

// Persistent across renders — survives modal close/open
const recentMedicinesStore: MedicineOption[] = [];
const MAX_RECENT = 5;

function addToRecent(med: MedicineOption) {
  const idx = recentMedicinesStore.findIndex(m => m.id === med.id);
  if (idx >= 0) recentMedicinesStore.splice(idx, 1);
  recentMedicinesStore.unshift(med);
  if (recentMedicinesStore.length > MAX_RECENT) recentMedicinesStore.pop();
}

/**
 * Parse expiry shorthand: "0727" → "2027-07-01", "1228" → "2028-12-01"
 * Also handles "07/27", "07-27", "072027", "07/2027"
 */
function parseExpiryShorthand(input: string): string | null {
  const cleaned = input.replace(/[\/\-\s]/g, '');
  
  // MMYY → 4 digits
  if (/^\d{4}$/.test(cleaned)) {
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt('20' + cleaned.substring(2, 4));
    if (month >= 1 && month <= 12 && year >= 2024 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }
  
  // MMYYYY → 6 digits
  if (/^\d{6}$/.test(cleaned)) {
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt(cleaned.substring(2, 6));
    if (month >= 1 && month <= 12 && year >= 2024 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }

  return null;
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
  const dropdownListRef = useRef<HTMLDivElement>(null);

  const [rackLocations, setRackLocations] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  
  const [isCreatingNewMedicine, setIsCreatingNewMedicine] = useState(false);
  const [batchesAdded, setBatchesAdded] = useState(0);
  const [lastAddedName, setLastAddedName] = useState('');
  
  // "Same Medicine +" mode: keeps medicine locked, only batch fields editable
  const [sameMedicineMode, setSameMedicineMode] = useState(false);
  const [lockedMedicine, setLockedMedicine] = useState<MedicineOption | null>(null);
  
  // Recent medicines
  const [recentMedicines, setRecentMedicines] = useState<MedicineOption[]>([...recentMedicinesStore]);

  // Expiry shorthand
  const [expiryText, setExpiryText] = useState('');

  // Auto-scroll dropdown to highlighted item
  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownListRef.current) return;
    const el = dropdownListRef.current.querySelector('[data-highlighted="true"]') as HTMLElement;
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex]);

  // Refs for keyboard navigation
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

    // Restore last company from localStorage
    const savedCompany = localStorage.getItem('inv_lastCompany') || '';
    setSelectedCompanyId(savedCompany);
    setMedicineSearch('');
    setSelectedCategory('');
    setIsCreatingNewMedicine(false);
    setHighlightedIndex(-1);
    setBatchesAdded(0);
    setLastAddedName('');
    setSameMedicineMode(false);
    setExpiryText('');
    setRecentMedicines([...recentMedicinesStore]);

    // Restore locked medicine from localStorage
    try {
      const savedMed = localStorage.getItem('inv_lastMedicine');
      if (savedMed) {
        setLockedMedicine(JSON.parse(savedMed));
      } else {
        setLockedMedicine(null);
      }
    } catch { setLockedMedicine(null); }
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

    setTimeout(() => {
      if (savedCompany) {
        medicineRef.current?.focus();
      } else {
        companyRef.current?.focus();
      }
    }, 150);
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
    if (!selectedCompanyId || medicineSearch.length < 2 || formData.medicineId) {
      if (formData.medicineId) return;
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
  }, [medicineSearch, selectedCompanyId, formData.medicineId]);

  const handleCompanyChange = (val: string) => {
    setSelectedCompanyId(val);
    localStorage.setItem('inv_lastCompany', val);
    setMedicineSearch('');
    setIsCreatingNewMedicine(false);
    setSelectedCategory('');
    setFormData(c => ({ ...c, medicineId: '' }));
    setMedicineOptions([]);
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

    // Save to recents
    addToRecent(med);
    setRecentMedicines([...recentMedicinesStore]);

    setTimeout(() => batchRef.current?.focus(), 50);

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
    setTimeout(() => batchRef.current?.focus(), 50);
  };

  // "Same Medicine +" handler — always reads fresh from localStorage
  const handleSameMedicine = () => {
    // Read fresh from localStorage in case it was updated
    let med = lockedMedicine;
    try {
      const saved = localStorage.getItem('inv_lastMedicine');
      if (saved) med = JSON.parse(saved);
    } catch { /* use state */ }
    if (!med) return;
    setLockedMedicine(med);
    setSameMedicineMode(true);
    setMedicineSearch(med.name);
    setSelectedCategory(med.category || '');
    setFormData(c => ({
      ...c,
      medicineId: med!.id,
      batchNumber: '',
      expiryDate: '',
      stockQty: '',
      gstPercent: med!.gstPercent || c.gstPercent,
      // Keep: purchaseRate, mrp, packing, rackLocation
    }));
    setExpiryText('');
    setError({});
    setShowMedicineDropdown(false);

    // Auto-fill from last batch of this medicine
    axios.get(`/api/medicines/${med.id}/last-mrp`).then(res => {
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
    }).catch(() => {});

    setTimeout(() => batchRef.current?.focus(), 50);
  };

  // Expiry shorthand handler
  const handleExpiryInput = (value: string) => {
    setExpiryText(value);
    
    // Try parsing shorthand
    const parsed = parseExpiryShorthand(value);
    if (parsed) {
      setFormData(c => ({ ...c, expiryDate: parsed }));
      setError(er => ({ ...er, expiryDate: '' }));
    } else if (value.length === 0) {
      setFormData(c => ({ ...c, expiryDate: '' }));
    }
    // Don't clear expiryDate if user is still typing
  };

  const handleExpiryDatePicker = (value: string) => {
    setFormData(c => ({ ...c, expiryDate: value }));
    setError(er => ({ ...er, expiryDate: '' }));
    // Sync text display
    if (value) {
      const [y, m] = value.split('-');
      setExpiryText(`${m}/${y.slice(2)}`);
    }
  };

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

      const addedName = medicineSearch.trim();
      setBatchesAdded(prev => prev + 1);
      setLastAddedName(addedName);

      // Save the current medicine for "Same Medicine +" mode
      // Use local `medicineId` (not formData.medicineId) — it includes newly created medicines
      if (medicineId) {
        const currentMed = medicineOptions.find(m => m.id === medicineId) 
          || recentMedicinesStore.find(m => m.id === medicineId)
          || lockedMedicine;
        let medToSave: MedicineOption;
        if (currentMed && currentMed.id === medicineId) {
          medToSave = currentMed;
        } else {
          medToSave = {
            id: medicineId,
            name: medicineSearch.trim(),
            company: companies.find(c => c.id === selectedCompanyId)?.name || '',
            category: selectedCategory,
            hsn: '',
            packing: formData.packing,
            gstPercent: formData.gstPercent,
          };
        }
        setLockedMedicine(medToSave);
        localStorage.setItem('inv_lastMedicine', JSON.stringify(medToSave));
      }

      // Reset for next entry — keep company, rack, GST, and all rate info
      const keepRack = formData.rackLocation;
      const keepGst = formData.gstPercent;
      setSameMedicineMode(false);
      setMedicineSearch('');
      setSelectedCategory('');
      setIsCreatingNewMedicine(false);
      setMedicineOptions([]);
      setHighlightedIndex(-1);
      setExpiryText('');
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

  // Show recents when medicine field is focused but empty
  const showRecents = showMedicineDropdown && medicineSearch.length < 2 && !formData.medicineId && recentMedicines.length > 0;

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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedCompanyId) {
                    e.preventDefault();
                    medicineRef.current?.focus();
                  }
                }}
                disabled={sameMedicineMode}
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
              {sameMedicineMode ? (
                // Locked medicine display
                <div className="flex h-10 w-full items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  {medicineSearch}
                </div>
              ) : (
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
                  onFocus={() => {
                    if (medicineSearch.length < 2 && !formData.medicineId && recentMedicines.length > 0) {
                      setShowMedicineDropdown(true);
                    }
                  }}
                  onKeyDown={handleMedicineKeyDown}
                  disabled={!selectedCompanyId}
                  className={`w-full ${isCreatingNewMedicine ? 'border-blue-500 ring-1 ring-blue-200' : ''}`}
                  autoComplete="off"
                />
              )}
              {isSearchingMedicines && (
                <div className="absolute right-3 top-9 h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-white" />
              )}
              {isCreatingNewMedicine && (
                <span className="text-xs text-blue-600 font-medium">✨ New medicine will be created</span>
              )}

              {/* Recent medicines dropdown */}
              {showRecents && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Recent
                  </div>
                  {recentMedicines
                    .filter(m => {
                      // Only show recents matching current company
                      const company = companies.find(c => c.id === selectedCompanyId);
                      return !company || m.company === company.name;
                    })
                    .map((med, idx) => (
                    <div 
                      key={med.id} 
                      className={`px-4 py-2 text-sm cursor-pointer border-b last:border-0 border-gray-100 transition-colors ${
                        idx === highlightedIndex ? 'bg-emerald-100 text-emerald-900' : 'hover:bg-emerald-50'
                      }`}
                      onClick={() => handleSelectMedicine(med)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      <div className="font-medium text-emerald-800">{med.name}</div>
                      <div className="text-xs text-gray-500">{med.category}{med.packing ? ` • ${med.packing}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Search results dropdown */}
              {showMedicineDropdown && medicineSearch.length >= 2 && medicineOptions.length > 0 && !formData.medicineId && (
                <div ref={dropdownListRef} className="absolute top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {medicineOptions.map((med, idx) => (
                    <div 
                      key={med.id} 
                      data-highlighted={idx === highlightedIndex ? 'true' : undefined}
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
                    data-highlighted={highlightedIndex === medicineOptions.length ? 'true' : undefined}
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
              {showMedicineDropdown && medicineSearch.length >= 2 && medicineOptions.length === 0 && !isSearchingMedicines && !formData.medicineId && (
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
              <Label>Expiry Date * <span className="text-[10px] text-gray-400 font-normal">(type MMYY e.g. 0727)</span></Label>
              <div className="flex gap-2">
                <Input
                  ref={expiryRef}
                  tabIndex={5}
                  placeholder="MMYY e.g. 0727"
                  value={expiryText}
                  onChange={(e) => handleExpiryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (formData.expiryDate) {
                        qtyRef.current?.focus();
                      }
                    }
                  }}
                  className="flex-1"
                  maxLength={6}
                />
                <Input
                  type="date"
                  tabIndex={-1}
                  value={formData.expiryDate}
                  onChange={(e) => handleExpiryDatePicker(e.target.value)}
                  className="w-12 px-1 opacity-60"
                  title="Or use date picker"
                />
              </div>
              {formData.expiryDate && (
                <span className="text-[10px] text-emerald-600 font-medium">
                  → {new Date(formData.expiryDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </span>
              )}
              {error.expiryDate && <span className="text-xs text-red-600 font-medium">{error.expiryDate}</span>}
              {isExpiringSoon() && !error.expiryDate && (
                <div className="flex items-start text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded w-full">
                  ⚠️ This batch expires soon
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

        {/* Success bar with "Same Medicine +" */}
        {batchesAdded > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">{batchesAdded}</span>
            <span className="text-emerald-800 font-medium flex-1 truncate">
              {batchesAdded === 1 ? 'batch' : 'batches'} added{lastAddedName ? ` — ${lastAddedName}` : ''}
            </span>
            {lockedMedicine && !sameMedicineMode && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 h-8 text-xs font-semibold"
                onClick={handleSameMedicine}
              >
                <Copy className="h-3.5 w-3.5" />
                Same Medicine +
              </Button>
            )}
          </div>
        )}

        {/* Show "Same Medicine +" from previous session (no batches added yet) */}
        {batchesAdded === 0 && lockedMedicine && !sameMedicineMode && !formData.medicineId && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <Copy className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-blue-800 font-medium flex-1 truncate">
              Quick add: continue with <strong>{lockedMedicine.name}</strong>?
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-800 h-8 text-xs font-semibold"
              onClick={handleSameMedicine}
            >
              Same Medicine +
            </Button>
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
