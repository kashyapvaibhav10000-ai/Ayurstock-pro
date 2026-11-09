'use client';

import { useEffect, useState, useRef, KeyboardEvent } from 'react';
import axios from 'axios';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Copy, Clock, Camera, Loader2, X, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';

interface BatchOption {
  id: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  packing: string;
  rackLocation: string | null;
  stockQty: number;
}

interface MedicineOption {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn: string;
  packing?: string;
  gstPercent?: number;
  batches?: BatchOption[];
}

// One dropdown row per batch, so variants of a medicine (different MRP or
// packing) each show up; a medicine without batches gets one row.
type SearchRow = { med: MedicineOption; batch: BatchOption | null };

function formatExpiryShort(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
}

function isExpired(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getUTCFullYear() * 12 + d.getUTCMonth() < now.getUTCFullYear() * 12 + now.getUTCMonth();
}

const TAG_TONES = {
  batch: 'bg-primary/10 text-primary ring-primary/20',
  expiry: 'bg-warning/15 text-warning ring-warning/25',
  expired: 'bg-danger/15 text-danger ring-danger/25',
  mrp: 'bg-success/15 text-success ring-success/25',
  muted: 'bg-secondary text-muted-foreground ring-border',
} as const;

/** Small pill for one batch detail; the label is for screen readers / hover only. */
function InfoTag({ label, tone, children }: { label: string; tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return (
    <span
      title={label}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 tabular-nums ring-1 ring-inset ${TAG_TONES[tone]}`}
    >
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}

function BatchTags({ med, batch }: { med: MedicineOption; batch: BatchOption | null }) {
  if (!batch) {
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {med.category ? <InfoTag label="Category" tone="muted">{med.category}</InfoTag> : null}
        {med.packing ? <InfoTag label="Packing" tone="muted">{med.packing}</InfoTag> : null}
        <span className="text-[11px] text-muted-foreground self-center">No batches yet</span>
      </div>
    );
  }
  const expiry = formatExpiryShort(batch.expiryDate);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <InfoTag label="Batch" tone="batch">{batch.batchNumber}</InfoTag>
      {expiry ? <InfoTag label="Expiry" tone={isExpired(batch.expiryDate) ? 'expired' : 'expiry'}>{expiry}</InfoTag> : null}
      <InfoTag label="MRP" tone="mrp">{`₹${Number(batch.mrp).toFixed(2)}`}</InfoTag>
      {batch.packing ? <InfoTag label="Packing" tone="muted">{batch.packing}</InfoTag> : null}
    </div>
  );
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

// ─── Camera label scan helpers ────────────────────────────────────────────────

/** Fields a label scan can pre-fill; highlighted until the user edits them. */
type AutoField = 'company' | 'medicine' | 'batch' | 'expiry' | 'mrp' | 'packing';

interface LabelScan {
  medicine_name: string | null;
  company: string | null;
  batch: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  mrp: number | null;
  packing: string | null;
  confidence: number | null;
}

const LABEL_SCAN_ERROR = "Couldn't read label, enter manually";
const LABEL_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Shrink a camera photo before upload: longest side ~1280px, JPEG ~0.7. The
 * server is small; full-size phone photos (5-12 MB) are never sent.
 */
async function compressPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not open the photo'));
      image.src = url;
    });
    const encode = (maxSide: number, quality: number) => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the photo'))), 'image/jpeg', quality)
      );
    };
    let blob = await encode(1280, 0.7);
    if (blob.size > LABEL_UPLOAD_MAX_BYTES) blob = await encode(1024, 0.5);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** 0..1 overlap of two names (token Jaccard; full containment counts as a match). */
function nameSimilarity(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ca = na.replace(/ /g, '');
  const cb = nb.replace(/ /g, '');
  if (Math.min(ca.length, cb.length) >= 4 && (ca.includes(cb) || cb.includes(ca))) return 0.9;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const common = [...ta].filter((t) => tb.has(t)).length;
  return common / new Set([...ta, ...tb]).size;
}

/** The searched medicine closest to the scanned name, if it is close enough. */
function closestMedicine(options: MedicineOption[], scannedName: string): MedicineOption | null {
  let best: MedicineOption | null = null;
  let bestScore = 0;
  for (const med of options) {
    const score = nameSimilarity(med.name, scannedName);
    if (score > bestScore) {
      best = med;
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/** Light yellow while a field holds a scanned value the user has not touched yet. */
const AUTO_FILLED_CLASS = 'bg-yellow-100/80 dark:bg-yellow-400/15 ring-1 ring-yellow-300/80';

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
  // Optional purchase details; kept across adds so several items from one
  // invoice land on the same purchase record.
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState('');
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

  // GST category defaults cache
  const [gstCategoryMap, setGstCategoryMap] = useState<Record<string, number>>({});

  // Camera label scan
  const [scanningLabel, setScanningLabel] = useState(false);
  const [autoFilled, setAutoFilled] = useState<Set<AutoField>>(() => new Set());
  const scanAbortRef = useRef<AbortController | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const clearAuto = (field: AutoField) =>
    setAutoFilled((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
  const autoClass = (field: AutoField) => (autoFilled.has(field) ? AUTO_FILLED_CLASS : '');

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
  const mrpRef = useRef<HTMLInputElement>(null);
  const packingRef = useRef<HTMLInputElement>(null);
  const rackRef = useRef<HTMLSelectElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const [formData, setFormData] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    stockQty: '' as number | string,
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
    setAutoFilled(new Set());
    setScanningLabel(false);

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
      mrp: '',
      packing: '',
      rackLocation: '',
      gstPercent: 5,
    });
    setError({});
    setShowMedicineDropdown(false);

    fetchCompanies();
    fetchRackLocations();
    axios
      .get('/api/suppliers')
      .then((res) => setSuppliers(res.data.data || []))
      .catch(() => setSuppliers([]));
    fetchGstDefaults();

    setTimeout(() => {
      if (savedCompany) {
        medicineRef.current?.focus();
      } else {
        companyRef.current?.focus();
      }
    }, 150);
  }, [isOpen]);

  // Closing the modal cancels a scan in flight.
  useEffect(() => {
    if (!isOpen) scanAbortRef.current?.abort();
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

  const fetchGstDefaults = async () => {
    try {
      const res = await axios.get('/api/settings/gst-categories');
      if (res.data.success) {
        const map: Record<string, number> = {};
        for (const item of res.data.data) {
          map[item.category] = item.gstPercent;
        }
        setGstCategoryMap(map);
      }
    } catch (e) {
      // Silently fail — defaults stay at current value
    }
  };

  useEffect(() => {
    if (!selectedCompanyId || medicineSearch.length < 2 || formData.medicineId || isCreatingNewMedicine) {
      if (formData.medicineId) return;
      setMedicineOptions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingMedicines(true);
      try {
        const res = await axios.get('/api/medicines/search', {
          params: { company: selectedCompanyId, q: medicineSearch, includeBatches: 'true' },
        });
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
  }, [medicineSearch, selectedCompanyId, formData.medicineId, isCreatingNewMedicine]);

  const handleCompanyChange = (val: string) => {
    setSelectedCompanyId(val);
    localStorage.setItem('inv_lastCompany', val);
    clearAuto('company');
    // A scanned name waiting for its company is kept and searched under it.
    const keepScannedName = autoFilled.has('medicine') && !formData.medicineId && medicineSearch.trim().length >= 2;
    if (!keepScannedName) setMedicineSearch('');
    setIsCreatingNewMedicine(false);
    setSelectedCategory('');
    setFormData(c => ({ ...c, medicineId: '' }));
    setMedicineOptions([]);
    setTimeout(() => medicineRef.current?.focus(), 50);
  };

  type FormOverrides = Partial<Pick<typeof formData, 'batchNumber' | 'expiryDate' | 'mrp' | 'packing'>>;

  // `overrides` (from a label scan) are applied after the batch / last-MRP
  // fill, so values read off the package win over history.
  const handleSelectMedicine = async (med: MedicineOption, batch: BatchOption | null = null, overrides: FormOverrides = {}) => {
    setSelectedCategory(med.category || '');
    setIsCreatingNewMedicine(false);
    setFormData(c => ({ ...c, medicineId: med.id, mrp: '', packing: med.packing || '', gstPercent: med.gstPercent || 5, ...overrides }));
    setMedicineSearch(med.name);
    setShowMedicineDropdown(false);
    setHighlightedIndex(-1);
    setError(e => ({ ...e, medicineId: '' }));

    // Save to recents
    addToRecent(med);
    setRecentMedicines([...recentMedicinesStore]);

    setTimeout(() => batchRef.current?.focus(), 50);

    // A picked batch fills MRP/packing/rack from that batch; otherwise from
    // the medicine's latest batch.
    if (batch) {
      setFormData(c => ({
        ...c,
        mrp: batch.mrp || c.mrp,
        packing: batch.packing || c.packing,
        rackLocation: batch.rackLocation || c.rackLocation,
        ...overrides,
      }));
      return;
    }

    try {
      const res = await axios.get(`/api/medicines/${med.id}/last-mrp`);
      if (res.data.success && res.data.data) {
        const d = res.data.data;
        setFormData(c => ({
          ...c,
          mrp: d.mrp || c.mrp,
          packing: d.packing || c.packing,
          rackLocation: d.rackLocation || c.rackLocation,
          ...overrides,
        }));
      }
    } catch(e) { /* silent */ }
  };

  // ─── Camera label scan ───────────────────────────────────────────────
  const cancelLabelScan = () => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setScanningLabel(false);
  };

  /**
   * Photo → compressed JPEG → /api/inventory/scan-label → fill only the
   * fields that are still empty. Nothing is saved: the user reviews the
   * highlighted fields and presses Add & Next.
   */
  const handleLabelPhoto = async (file: File) => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanningLabel(true);

    // What the user had already typed; never overwritten.
    const before = {
      companyId: selectedCompanyId,
      medicineSearch: medicineSearch.trim(),
      medicineId: formData.medicineId,
      batchNumber: formData.batchNumber,
      expiryText,
      mrp: formData.mrp,
      packing: formData.packing,
    };

    try {
      const photo = await compressPhoto(file);
      const upload = new FormData();
      upload.append('image', photo, 'label.jpg');
      const res = await axios.post('/api/inventory/scan-label', upload, { signal: controller.signal });
      const scan: LabelScan | undefined = res.data?.data;
      if (!res.data?.success || !scan) throw new Error('unreadable');
      if (controller.signal.aborted) return;

      const filled = new Set<AutoField>();
      const overrides: FormOverrides = {};

      let companyId = before.companyId;
      if (!companyId && scan.company) {
        const match = companies
          .map((c) => ({ c, score: nameSimilarity(c.name, scan.company!) }))
          .sort((x, y) => y.score - x.score)[0];
        if (match && match.score >= 0.6) {
          companyId = match.c.id;
          setSelectedCompanyId(match.c.id);
          localStorage.setItem('inv_lastCompany', match.c.id);
          filled.add('company');
        }
      }

      if (!before.batchNumber && scan.batch) {
        overrides.batchNumber = scan.batch;
        filled.add('batch');
      }
      if (!before.expiryText && scan.expiry_month && scan.expiry_year) {
        const mmyy = `${String(scan.expiry_month).padStart(2, '0')}${String(scan.expiry_year).slice(-2)}`;
        const parsed = parseExpiryShorthand(mmyy);
        if (parsed) {
          setExpiryText(mmyy);
          overrides.expiryDate = parsed;
          filled.add('expiry');
        }
      }
      if ((before.mrp === '' || Number(before.mrp) <= 0) && scan.mrp) {
        overrides.mrp = scan.mrp;
        filled.add('mrp');
      }
      if (!before.packing && scan.packing) {
        overrides.packing = scan.packing;
        filled.add('packing');
      }

      let linked = false;
      if (!before.medicineId && !before.medicineSearch && scan.medicine_name && !sameMedicineMode) {
        filled.add('medicine');
        // Link to an existing medicine when one is close enough, so the batch
        // lands on it instead of a duplicate.
        if (companyId) {
          const firstWord = normalizeName(scan.medicine_name).split(' ').find((w) => w.length >= 3) || scan.medicine_name;
          try {
            const found = await axios.get('/api/medicines/search', {
              params: { company: companyId, q: firstWord, includeBatches: 'true' },
              signal: controller.signal,
            });
            const match = found.data?.success ? closestMedicine(found.data.data || [], scan.medicine_name) : null;
            if (match) {
              const sameBatch = overrides.batchNumber
                ? match.batches?.find((b) => b.batchNumber.toUpperCase() === overrides.batchNumber!.toUpperCase()) ?? null
                : null;
              await handleSelectMedicine(match, sameBatch, overrides);
              linked = true;
            }
          } catch (e) {
            if (controller.signal.aborted) return;
          }
        }
        if (!linked) {
          // No close match: keep the name as typed text for a new medicine.
          setMedicineSearch(scan.medicine_name);
          setMedicineOptions([]);
          setShowMedicineDropdown(false);
          if (companyId) {
            setIsCreatingNewMedicine(true);
          }
        }
      }
      if (!linked) {
        setFormData((c) => ({ ...c, ...overrides }));
        setError((er) => ({ ...er, batchNumber: '', expiryDate: '', mrp: '' }));
      }
      if (controller.signal.aborted) return;

      if (filled.size === 0) {
        toast.message('Nothing new to fill from this label');
      } else {
        setAutoFilled((current) => new Set([...current, ...filled]));
        toast.success('Label read. Check the highlighted fields, then Add & Next.');
      }
    } catch (scanError) {
      if (controller.signal.aborted || axios.isCancel(scanError)) return;
      toast.error(LABEL_SCAN_ERROR);
    } finally {
      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null;
        setScanningLabel(false);
      }
    }
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
      // Keep: mrp, packing, rackLocation
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
      setExpiryText(`${m}${y.slice(2)}`);
      clearAuto('expiry');
    }
  };

  const handleMedicineKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showMedicineDropdown) {
      if (e.key === 'Enter' && (formData.medicineId || isCreatingNewMedicine)) {
        e.preventDefault();
        batchRef.current?.focus();
      }
      return;
    }

    const totalItems = searchRows.length + 1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchRows.length) {
        handleSelectMedicine(searchRows[highlightedIndex].med, searchRows[highlightedIndex].batch);
      } else if (highlightedIndex === searchRows.length) {
        handleCreateNewMedicine();
      } else if (searchRows.length === 1) {
        handleSelectMedicine(searchRows[0].med, searchRows[0].batch);
      } else if (searchRows.length === 0) {
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
        purchaseRate: null,
        sellingRate: Number(formData.mrp),
        packing: formData.packing,
        rackLocation: formData.rackLocation,
        gstPercent: Number(formData.gstPercent),
        supplierId: purchaseSupplierId || null,
        invoiceNumber: purchaseInvoiceNo.trim() || null,
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
      setAutoFilled(new Set());
      setFormData({
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        stockQty: '',
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

  const searchRows: SearchRow[] = medicineOptions.flatMap<SearchRow>((med) =>
    med.batches && med.batches.length > 0
      ? med.batches.map((batch) => ({ med, batch }))
      : [{ med, batch: null }]
  );

  // Show recents when medicine field is focused but empty
  const showRecents = showMedicineDropdown && medicineSearch.length < 2 && !formData.medicineId && recentMedicines.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="box-border w-full max-w-[100vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden px-4 pt-4 sm:p-6"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 text-left min-w-0">
          <DialogTitle className="min-w-0 truncate text-lg sm:text-xl">Add Inventory</DialogTitle>
          <DialogClose className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-label-secondary transition-colors hover:bg-fill-strong hover:text-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        {scanningLabel && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary" role="status">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 font-medium">Reading label...</span>
            <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={cancelLabelScan}>
              Cancel
            </Button>
          </div>
        )}

        {error.global && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error.global}
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-4 py-2 px-0.5">
          
          <div className="grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Company Name *</Label>
              <select
                ref={companyRef}
                tabIndex={1}
                className={`flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${autoClass('company')}`}
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
              {error.companyId && <span className="text-xs text-danger font-medium">{error.companyId}</span>}
            </div>

            <div className="grid min-w-0 gap-2 relative" ref={dropdownRef}>
              <Label className="text-sm">Medicine Name *</Label>
              {sameMedicineMode ? (
                // Locked medicine display
                <div className="flex h-11 w-full min-w-0 items-center rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-base font-medium text-primary">
                  <span className="truncate">{medicineSearch}</span>
                </div>
              ) : (
                <div className="flex min-w-0 gap-2">
                  <div className="relative min-w-0 flex-1">
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
                        clearAuto('medicine');
                      }}
                      onFocus={() => {
                        if (medicineSearch.length < 2 && !formData.medicineId && recentMedicines.length > 0) {
                          setShowMedicineDropdown(true);
                        }
                      }}
                      onKeyDown={handleMedicineKeyDown}
                      disabled={!selectedCompanyId}
                      className={`w-full min-w-0 h-11 text-base pr-9 ${isCreatingNewMedicine ? 'border-blue-500 ring-1 ring-blue-200' : ''} ${autoClass('medicine')}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="words"
                      spellCheck={false}
                      enterKeyHint="next"
                    />
                    {isSearchingMedicines && (
                      <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-white" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-11 shrink-0 p-0"
                    onClick={() => labelInputRef.current?.click()}
                    disabled={scanningLabel}
                    aria-label="Scan medicine label with camera"
                    title="Scan label with camera"
                  >
                    {scanningLabel ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  </Button>
                  {/* capture="environment" opens the rear camera directly on phones */}
                  <input
                    ref={labelInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    tabIndex={-1}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = ''; // allow retaking the same photo
                      if (file) handleLabelPhoto(file);
                    }}
                  />
                </div>
              )}
              {isCreatingNewMedicine && (
                <span className="text-xs text-blue-600 font-medium">✨ New medicine will be created</span>
              )}

              {/* Recent medicines dropdown */}
              {showRecents && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden max-h-64 overflow-y-auto overscroll-contain">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-surface-muted flex items-center gap-1">
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
                      className={`px-4 py-2 text-sm cursor-pointer border-b last:border-0 border-border transition-colors ${
                        idx === highlightedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10'
                      }`}
                      onClick={() => handleSelectMedicine(med)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      <div className="font-medium text-primary">{med.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {med.category ? <InfoTag label="Category" tone="muted">{med.category}</InfoTag> : null}
                        {med.packing ? <InfoTag label="Packing" tone="muted">{med.packing}</InfoTag> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Search results dropdown */}
              {showMedicineDropdown && medicineSearch.length >= 2 && searchRows.length > 0 && !formData.medicineId && (
                <div ref={dropdownListRef} className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden max-h-64 overflow-y-auto overscroll-contain">
                  {searchRows.map(({ med, batch }, idx) => (
                    <div 
                      key={batch ? batch.id : med.id} 
                      data-highlighted={idx === highlightedIndex ? 'true' : undefined}
                      className={`px-4 py-2 text-sm cursor-pointer border-b last:border-0 border-border transition-colors ${
                        idx === highlightedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-primary/10'
                      }`}
                      onClick={() => handleSelectMedicine(med, batch)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                    >
                      <div className="font-medium text-primary">{med.name}</div>
                      <BatchTags med={med} batch={batch} />
                    </div>
                  ))}
                  <div 
                    data-highlighted={highlightedIndex === searchRows.length ? 'true' : undefined}
                    className={`px-4 py-2 text-sm cursor-pointer border-t border-border flex items-center gap-2 transition-colors ${
                      highlightedIndex === searchRows.length ? 'bg-blue-100 text-blue-900' : 'bg-surface-muted hover:bg-blue-50'
                    }`}
                    onClick={handleCreateNewMedicine}
                    onMouseEnter={() => setHighlightedIndex(searchRows.length)}
                  >
                    <Plus className="h-3.5 w-3.5 text-blue-600" />
                    <span className="font-medium text-blue-700">Create &quot;{medicineSearch.trim().toUpperCase()}&quot; as new medicine</span>
                  </div>
                </div>
              )}
              {showMedicineDropdown && medicineSearch.length >= 2 && searchRows.length === 0 && !isSearchingMedicines && !formData.medicineId && (
                <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden">
                  <div className="px-4 py-3 text-sm text-warning bg-warning/10 border-b border-warning/30">
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
              {error.medicineId && <span className="text-xs text-danger font-medium">{error.medicineId}</span>}
            </div>
          </div>

          {/* Category selector — shown when creating a new medicine */}
          {isCreatingNewMedicine && (
            <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <Label className="text-blue-800 font-semibold text-xs">Category for new medicine *</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    tabIndex={3}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setError(e => ({ ...e, category: '' }));
                      // Auto-fill GST from category defaults
                      if (gstCategoryMap[cat] !== undefined) {
                        setFormData(c => ({ ...c, gstPercent: gstCategoryMap[cat] }));
                      }
                      setTimeout(() => batchRef.current?.focus(), 50);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selectedCategory === cat
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'border-blue-200 bg-surface text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {error.category && <span className="text-xs text-danger font-medium">{error.category}</span>}
            </div>
          )}

          <div className="grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Batch Number *</Label>
              <Input
                ref={batchRef}
                tabIndex={4}
                placeholder="Enter batch identifier"
                value={formData.batchNumber}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, batchNumber: e.target.value }));
                  setError(er => ({...er, batchNumber: ''}));
                  clearAuto('batch');
                }}
                onKeyDown={(e) => handleFieldEnter(e, expiryRef)}
                className={`w-full min-w-0 h-11 text-base ${autoClass('batch')}`}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                enterKeyHint="next"
              />
              {error.batchNumber && <span className="text-xs text-danger font-medium">{error.batchNumber}</span>}
            </div>
            
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Expiry Date * <span className="text-[11px] text-muted-foreground font-normal">(type MMYY)</span></Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  ref={expiryRef}
                  tabIndex={5}
                  placeholder="e.g. 0727"
                  value={expiryText}
                  onChange={(e) => {
                    handleExpiryInput(e.target.value);
                    clearAuto('expiry');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (formData.expiryDate) {
                        qtyRef.current?.focus();
                      }
                    }
                  }}
                  className={`min-w-0 flex-1 h-11 text-base ${autoClass('expiry')}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="off"
                  enterKeyHint="next"
                />
                {/* Date picker fallback: an icon-sized box; the native text is hidden
                    (it cannot fit) and the whole box opens the picker. */}
                <div className="relative h-11 w-12 shrink-0">
                  <Input
                    type="date"
                    tabIndex={-1}
                    value={formData.expiryDate}
                    onChange={(e) => handleExpiryDatePicker(e.target.value)}
                    className="h-11 w-12 min-w-0 cursor-pointer px-1 text-transparent [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                    title="Or use date picker"
                    aria-label="Pick expiry date"
                  />
                  <CalendarDays className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              {formData.expiryDate && (
                <span className="text-[11px] text-primary font-medium">
                  → {new Date(formData.expiryDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </span>
              )}
              {error.expiryDate && <span className="text-xs text-danger font-medium">{error.expiryDate}</span>}
              {isExpiringSoon() && !error.expiryDate && (
                <div className="flex items-start text-xs font-semibold text-warning bg-warning/10 border border-warning/30 p-2 rounded w-full">
                  ⚠️ This batch expires soon
                </div>
              )}
            </div>
          </div>

          <div className="grid min-w-0 gap-3 grid-cols-1 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Quantity *</Label>
              <Input
                ref={qtyRef}
                tabIndex={6}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                enterKeyHint="next"
                placeholder="Enter quantity"
                value={formData.stockQty}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, stockQty: e.target.value.replace(/\D/g, '') }));
                  setError(er => ({...er, stockQty: ''}));
                }}
                onKeyDown={(e) => handleFieldEnter(e, mrpRef)}
                className="w-full min-w-0 h-11 text-base"
              />
              {error.stockQty && <span className="text-xs text-danger font-medium">{error.stockQty}</span>}
            </div>
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">MRP *</Label>
              <Input
                ref={mrpRef}
                tabIndex={8}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="next"
                placeholder="Enter MRP"
                value={formData.mrp}
                onChange={(e) => {
                  // Digits and one decimal point (iOS decimal pad, or pasted text).
                  const [whole, ...rest] = e.target.value.replace(/[^0-9.]/g, '').split('.');
                  const mrp = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
                  setFormData((c) => ({ ...c, mrp }));
                  setError(er => ({...er, mrp: ''}));
                  clearAuto('mrp');
                }}
                onKeyDown={(e) => handleFieldEnter(e, packingRef)}
                className={`w-full min-w-0 h-11 text-base ${autoClass('mrp')}`}
              />
              {error.mrp && <span className="text-xs text-danger font-medium">{error.mrp}</span>}
            </div>
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Packing</Label>
              <Input
                ref={packingRef}
                tabIndex={9}
                placeholder="e.g. 10x10 Strips, 100ml"
                list="packing-options"
                value={formData.packing}
                onChange={(e) => {
                  setFormData((c) => ({ ...c, packing: e.target.value }));
                  clearAuto('packing');
                }}
                onKeyDown={(e) => {
                  // Last field of the keyboard flow: Done / Enter = Add & Next.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!isSubmitDisabled) handleSubmit();
                  }
                }}
                className={`w-full min-w-0 h-11 text-base ${autoClass('packing')}`}
                autoComplete="off"
                enterKeyHint="done"
              />
              <datalist id="packing-options">
                {packingSuggestions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Rack Location *</Label>
              <select
                ref={rackRef}
                tabIndex={10}
                className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring"
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
              {error.rackLocation && <span className="text-xs text-danger font-medium">{error.rackLocation}</span>}
            </div>
            
            <div className="grid min-w-0 gap-2 sm:col-span-2">
              <Label className="text-sm">GST Rate *</Label>
              <div className="grid min-w-0 grid-cols-3 gap-2">
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
                    className={`min-w-0 flex flex-col items-center justify-center rounded-md border px-1 py-3 sm:p-3 sm:py-4 transition-all min-h-[60px] ${
                      Number(formData.gstPercent) === Number(opt.value)
                        ? 'bg-primary border-primary text-white'
                        : 'border-input bg-background text-muted-foreground hover:bg-primary/10'
                    }`}
                  >
                    <span className="text-sm sm:text-base font-bold">{opt.label}</span>
                    <span className="max-w-full truncate text-[11px] sm:text-xs opacity-80 font-normal mt-0.5">{opt.category}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Distributor <span className="text-[11px] text-muted-foreground font-normal">(optional)</span></Label>
              <select
                className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                value={purchaseSupplierId}
                onChange={(e) => setPurchaseSupplierId(e.target.value)}
              >
                <option value="">Manual entry (no distributor)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="grid min-w-0 gap-2">
              <Label className="text-sm">Invoice No <span className="text-[11px] text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={purchaseInvoiceNo}
                onChange={(e) => setPurchaseInvoiceNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Auto-generated if blank"
                className="w-full min-w-0 h-11 text-base"
                maxLength={60}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
          </div>

        </div>

        {/* Success bar with "Same Medicine +" */}
        {batchesAdded > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">{batchesAdded}</span>
            <span className="text-primary font-medium min-w-0 flex-1 truncate">
              {batchesAdded === 1 ? 'batch' : 'batches'} added{lastAddedName ? ` — ${lastAddedName}` : ''}
            </span>
            {lockedMedicine && !sameMedicineMode && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary h-9 sm:h-8 text-xs font-semibold"
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
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <Copy className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="text-blue-800 font-medium min-w-0 flex-1 basis-[10rem] truncate">
              Quick add: continue with <strong>{lockedMedicine.name}</strong>?
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto shrink-0 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-100 hover:text-blue-800 h-9 sm:h-8 text-xs font-semibold"
              onClick={handleSameMedicine}
            >
              Same Medicine +
            </Button>
          </div>
        )}

        <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={loading} 
            tabIndex={15}
            className="w-full sm:w-auto h-11 text-base"
          >
            {batchesAdded > 0 ? `Done (${batchesAdded} added)` : 'Cancel'}
          </Button>
          <Button 
            ref={submitRef}
            tabIndex={14}
            onClick={handleSubmit} 
            // Keep focus (and the iPhone keyboard) in the current field while
            // tapping; after a successful add focus moves to Medicine Name.
            onMouseDown={(e) => e.preventDefault()}
            disabled={isSubmitDisabled} 
            className="w-full sm:w-auto h-11 text-base bg-primary hover:bg-primary-hover"
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
