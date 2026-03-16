'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import axios from 'axios';

const CATEGORY_OPTIONS = [
  'Tablet',
  'Capsule',
  'Powder',
  'Churna',
  'Asav',
  'Syrup',
  'Oil',
  'Cream',
  'Gel',
  'Drops',
  'Bhasma',
  'Vati',
  'Chawanprash',
  'Other',
];

const PACKAGING_OPTIONS: Record<string, string[]> = {
  Tablet: ['10 Tab', '20 Tab', '30 Tab', '40 Tab', '60 Tab', '80 Tab', '100 Tab'],
  Capsule: ['10 Cap', '20 Cap', '30 Cap', '60 Cap'],
  Powder: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Churna: ['50 gm', '100 gm', '200 gm', '500 gm'],
  Asav: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Syrup: ['100 ml', '200 ml', '450 ml', '680 ml'],
  Cream: ['15 gm', '30 gm', '50 gm'],
  Gel: ['15 gm', '30 gm', '50 gm'],
  Oil: ['50 ml', '100 ml', '200 ml', '500 ml'],
  Drops: ['10 ml', '15 ml', '30 ml'],
  Bhasma: ['10 gm', '25 gm', '50 gm'],
  Vati: ['10 Tab', '20 Tab', '30 Tab', '60 Tab'],
  Chawanprash: ['250 gm', '500 gm', '1 kg'],
  Other: [],
};

export interface ParsedMedicine {
  name: string;
  company: string;
  category: string;
  barcode?: string;
  hsn?: string;
  packing?: string;
  mrp?: number;
  tradePrice?: number;
}

type ImportStatus = 'pending' | 'importing' | 'imported' | 'failed';

interface MedicineWithStatus extends ParsedMedicine {
  status: ImportStatus;
  error?: string;
}

interface ImportMedicinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (medicines: ParsedMedicine[]) => Promise<void>;
}

// ── Error banners with icons and guidance ────────────────────────────
function ErrorBanner({ errorCode, message }: { errorCode?: string; message: string }) {
  const getIcon = () => {
    switch (errorCode) {
      case 'NO_TEXT': return '📄';
      case 'EMPTY_AFTER_CLEAN': return '🧹';
      case 'AI_FAILED': return '🤖';
      case 'NO_API_KEY': return '🔑';
      case 'TIMEOUT': return '⏱️';
      default: return '❌';
    }
  };

  const getGuidance = () => {
    switch (errorCode) {
      case 'NO_TEXT':
        return 'This PDF appears to be scanned/image-based. Click "Run OCR" below to extract text using your browser.';
      case 'EMPTY_AFTER_CLEAN':
        return 'The PDF text was extracted but no medicine data was recognized. The PDF may contain different formatting. Try a different file.';
      case 'AI_FAILED':
        return 'The AI parsing service failed. This might be a temporary issue — please try again in a moment.';
      case 'NO_API_KEY':
        return 'The AI API key is not configured. Please contact your administrator to set up the OPENROUTER_API_KEY.';
      case 'TIMEOUT':
        return 'The request timed out. Try a smaller PDF or try again later.';
      default:
        return '';
    }
  };

  const guidance = getGuidance();

  return (
    <div className={`p-4 rounded-lg border ${errorCode === 'NO_TEXT' ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{getIcon()}</span>
        <div className="space-y-1">
          <p className={`text-sm font-medium ${errorCode === 'NO_TEXT' ? 'text-amber-800' : 'text-red-700'}`}>
            {message}
          </p>
          {guidance && (
            <p className={`text-xs ${errorCode === 'NO_TEXT' ? 'text-amber-600' : 'text-red-500'}`}>
              {guidance}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OCR Progress bar ─────────────────────────────────────────────────
function OcrProgressBar({ phase, page, totalPages, percent, message }: {
  phase: string;
  page: number;
  totalPages: number;
  percent: number;
  message: string;
}) {
  const getPhaseLabel = () => {
    switch (phase) {
      case 'loading': return '📖 Loading PDF...';
      case 'rendering': return `🖼️ Rendering page ${page}/${totalPages}`;
      case 'ocr': return `🔍 OCR processing page ${page}/${totalPages}`;
      case 'done': return '✅ OCR complete!';
      case 'error': return '❌ OCR failed';
      default: return message;
    }
  };

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{getPhaseLabel()}</span>
        <span className="text-gray-500">{percent}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{message}</p>
    </div>
  );
}

export default function ImportMedicinesModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportMedicinesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MedicineWithStatus[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'processing' | 'ocr' | 'preview'>('upload');
  const [parseError, setParseError] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string>('');
  const [pdfType, setPdfType] = useState<string>('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [newCompany, setNewCompany] = useState<string>('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [sequentialImport, setSequentialImport] = useState(false);
  const [currentImportIndex, setCurrentImportIndex] = useState<number>(-1);
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // OCR progress state
  const [ocrProgress, setOcrProgress] = useState({
    phase: 'loading',
    page: 0,
    totalPages: 0,
    percent: 0,
    message: '',
  });

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!isOpen) return;
    const loadCompanies = async () => {
      try {
        const res = await axios.get('/api/companies');
        if (res.data.success && Array.isArray(res.data.data)) {
          setCompanies(res.data.data.map((row: { name: string }) => row.name));
        }
      } catch {
        setCompanies([]);
      }
    };
    void loadCompanies();
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setParseError('Invalid file type. Please upload PDF, PNG, JPG, or JPEG.');
        setErrorCode('');
        return;
      }
      setFile(selectedFile);
      setParseError('');
      setErrorCode('');
    }
  };

  const handleDragDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const event = {
        target: { files: e.dataTransfer.files },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(event);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setParseError('');
    setErrorCode('');
    setStep('processing');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {};
      const authToken = token || localStorage.getItem('token');
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post('/api/medicines/import', formData, {
        headers,
      });

      if (response.data.success && response.data.medicines) {
        setPdfType(response.data.pdfType || 'searchable');
        setPreview(
          response.data.medicines.map((med: ParsedMedicine) => ({
            ...med,
            status: 'pending' as ImportStatus,
          }))
        );
        setSelectedRows(new Set(Array.from({ length: response.data.medicines.length }, (_, i) => i)));
        setStep('preview');
      } else if (response.data.errorCode === 'NO_TEXT') {
        // Scanned PDF detected — offer OCR option
        setPdfType('scanned');
        setErrorCode('NO_TEXT');
        setParseError(response.data.message || 'This PDF appears to be scanned.');
        setStep('upload');
      } else {
        setErrorCode(response.data.errorCode || '');
        setParseError(response.data.message || 'Failed to parse file');
        setStep('upload');
      }
    } catch (error) {
      const data = axios.isAxiosError(error) ? error.response?.data : null;
      setErrorCode(data?.errorCode || '');
      setParseError(data?.message || 'Failed to upload file');
      setStep('upload');
    } finally {
      setLoading(false);
    }
  };

  // ── Client-side OCR handler ─────────────────────────────────────────
  const handleRunOcr = async () => {
    if (!file) return;

    setStep('ocr');
    setParseError('');
    setErrorCode('');

    try {
      // Dynamic import — only loads in browser
      const { ocrPdfInBrowser } = await import('@/lib/pdfOcrClient');

      const extractedText = await ocrPdfInBrowser(file, (progress) => {
        setOcrProgress(progress);
      });

      if (!extractedText.trim()) {
        setParseError('OCR completed but no text could be extracted. The PDF may not contain readable content.');
        setErrorCode('');
        setStep('upload');
        return;
      }

      // Send extracted text to server for AI parsing
      setOcrProgress({
        phase: 'done',
        page: 0,
        totalPages: 0,
        percent: 95,
        message: 'Sending extracted text to AI parser...',
      });

      const formData = new FormData();
      formData.append('extractedText', extractedText);

      const headers: Record<string, string> = {};
      const authToken = token || localStorage.getItem('token');
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const response = await axios.post('/api/medicines/import', formData, { headers });

      if (response.data.success && response.data.medicines) {
        setPdfType('scanned');
        setPreview(
          response.data.medicines.map((med: ParsedMedicine) => ({
            ...med,
            status: 'pending' as ImportStatus,
          }))
        );
        setSelectedRows(new Set(Array.from({ length: response.data.medicines.length }, (_, i) => i)));
        setStep('preview');
      } else {
        setErrorCode(response.data.errorCode || '');
        setParseError(response.data.message || 'AI parsing found no medicines in the OCR text.');
        setStep('upload');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR processing failed';
      setParseError(message);
      setErrorCode('');
      setStep('upload');
    }
  };

  const startPolling = (jobId: string) => {
    const poll = async () => {
      try {
        const response = await axios.get(`/api/medicines/import/progress?jobId=${jobId}`);
        if (response.data.success) {
          const jobData = response.data;

          if (jobData.status === 'done') {
            const normalized = (jobData.medicines || []).map((row: ParsedMedicine) => {
              const category = row.category || detectCategory(row.packing || row.name);
              const options = PACKAGING_OPTIONS[category] || [];
              const packing = row.packing || (options.length > 0 ? options[0] : '');
              return {
                ...row,
                category,
                packing,
                status: 'pending' as ImportStatus,
              } as MedicineWithStatus;
            });
            setPreview(normalized);
            setSelectedRows(new Set(Array.from({ length: normalized.length }, (_, i) => i)));
            stopPolling();
          } else if (jobData.status === 'error') {
            setParseError(jobData.error || 'Import failed');
            stopPolling();
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setParseError('Failed to check import progress');
        stopPolling();
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    setPollingInterval(interval);
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === preview.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(Array.from({ length: preview.length }, (_, i) => i)));
    }
  };

  const updatePreviewField = (
    index: number,
    field: keyof ParsedMedicine,
    value: string
  ) => {
    setPreview((current) =>
      current.map((medicine, medicineIndex) => {
        if (medicineIndex !== index) {
          return medicine;
        }

        if (field === 'mrp' || field === 'tradePrice') {
          return {
            ...medicine,
            [field]: value === '' ? undefined : Number(value),
          };
        }

        if (field === 'packing') {
          const nextCategory = medicine.category || detectCategory(value || medicine.name);
          return {
            ...medicine,
            packing: value,
            category: nextCategory,
          };
        }

        return {
          ...medicine,
          [field]: value,
        };
      })
    );
  };

  const detectCategory = (packingText?: string) => {
    const text = (packingText || '').toLowerCase();
    if (text.includes('tab') || text.includes('vati')) return 'Tablet';
    if (text.includes('cap')) return 'Capsule';
    if (text.includes('churna')) return 'Churna';
    if (text.includes('bhasma')) return 'Bhasma';
    if (text.includes('drops')) return 'Drops';
    if (text.includes('gel')) return 'Gel';
    if (text.includes('cream')) return 'Cream';
    if (text.includes('oil') || text.includes('taila')) return 'Oil';
    if (text.includes('powder') || text.includes('gm') || text.includes('kg')) return 'Powder';
    if (text.includes('asav') || text.includes('arishta')) return 'Asav';
    if (text.includes('syrup') || text.includes('ml')) return 'Syrup';
    return 'Other';
  };

  const applyCompanyToAll = (company: string) => {
    setPreview((current) => current.map((row) => ({ ...row, company })));
  };

  const handleCompanySelect = (value: string) => {
    setSelectedCompany(value);
    if (value) {
      applyCompanyToAll(value);
    }
  };

  const handleCreateCompany = async () => {
    const name = newCompany.trim();
    if (!name) return;
    setCreatingCompany(true);
    try {
      const res = await axios.post('/api/companies', { name });
      if (res.data.success) {
        setCompanies((prev) => Array.from(new Set([...prev, name])));
        setSelectedCompany(name);
        applyCompanyToAll(name);
        setNewCompany('');
      } else {
        setParseError(res.data.message || 'Failed to create company');
      }
    } catch {
      setParseError('Failed to create company');
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleCategoryChange = (index: number, nextCategory: string) => {
    const options = PACKAGING_OPTIONS[nextCategory] || [];
    setPreview((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        const nextPacking = options.length > 0 ? options[0] : row.packing || '';
        return {
          ...row,
          category: nextCategory,
          packing: nextPacking,
        };
      })
    );
  };

  const selectedCount = useMemo(() => selectedRows.size, [selectedRows]);

  const importSingleMedicine = async (medicine: MedicineWithStatus, index: number) => {
    try {
      setPreview((current) =>
        current.map((m, i) => (i === index ? { ...m, status: 'importing' as ImportStatus } : m))
      );

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await axios.post('/api/medicines/import/single', {
        name: medicine.name,
        company: medicine.company,
        category: medicine.category,
        barcode: medicine.barcode,
        hsn: medicine.hsn,
        packing: medicine.packing,
        mrp: medicine.mrp,
        tradePrice: medicine.tradePrice,
      }, { headers });

      if (response.data.success) {
        setPreview((current) =>
          current.map((m, i) => (i === index ? { ...m, status: 'imported' as ImportStatus } : m))
        );
        setImportProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        return true;
      } else {
        throw new Error(response.data.message || 'Import failed');
      }
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : 'Import failed';

      setPreview((current) =>
        current.map((m, i) => (i === index ? { ...m, status: 'failed' as ImportStatus, error: errorMessage } : m))
      );
      setImportProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
      return false;
    }
  };

  const handleSequentialImport = async () => {
    const selectedMedicines = Array.from(selectedRows).sort((a, b) => a - b);
    setSequentialImport(true);
    setImportProgress({ completed: 0, total: selectedMedicines.length, failed: 0 });

    for (let i = 0; i < selectedMedicines.length; i++) {
      const index = selectedMedicines[i];
      setCurrentImportIndex(index);
      await importSingleMedicine(preview[index], index);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setSequentialImport(false);
    setCurrentImportIndex(-1);
  };

  const handleImport = async () => {
    const selectedMedicines = Array.from(selectedRows).map((index) => preview[index]);
    
    setLoading(true);
    try {
      await onSuccess(selectedMedicines);
      resetModal();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : 'Failed to import medicines';
      setParseError(message || 'Failed to import medicines');
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setFile(null);
    setPreview([]);
    setSelectedRows(new Set());
    setStep('upload');
    setParseError('');
    setErrorCode('');
    setPdfType('');
    setSequentialImport(false);
    setCurrentImportIndex(-1);
    setImportProgress({ completed: 0, total: 0, failed: 0 });
    setJobId(null);
    stopPolling();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetModal()}>
      <DialogContent className="max-w-7xl">
        <DialogHeader>
          <DialogTitle>Import Medicines</DialogTitle>
        </DialogHeader>

        {/* ── Upload Step ────────────────────────────────────────────── */}
        {step === 'upload' ? (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDragDrop}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-500 transition-colors cursor-pointer"
            >
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer">
                <div className="text-4xl mb-2">📁</div>
                <p className="text-sm font-medium text-gray-700">
                  Drag & Drop File
                </p>
                <p className="text-xs text-gray-500 mt-1">or</p>
                <Button variant="outline" className="mt-3" type="button">
                  Browse File
                </Button>
              </label>
            </div>

            {file && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <p className="text-sm">
                  <strong>Selected:</strong> {file.name}
                  <span className="text-gray-500 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                </p>
              </div>
            )}

            {parseError && (
              <ErrorBanner errorCode={errorCode} message={parseError} />
            )}

            {/* Show Run OCR button when scanned PDF is detected */}
            {errorCode === 'NO_TEXT' && file && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">🔍 Client-Side OCR Available</p>
                    <p className="text-xs text-blue-600 mt-1">
                      Extract text from scanned PDF using your browser. No server costs — runs entirely on your device.
                    </p>
                  </div>
                  <Button
                    onClick={handleRunOcr}
                    className="bg-blue-600 hover:bg-blue-700 text-white ml-4"
                  >
                    Run OCR
                  </Button>
                </div>
              </div>
            )}
          </div>

        /* ── Processing Step ──────────────────────────────────────────── */
        ) : step === 'processing' ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-lg font-medium text-gray-700">Processing PDF...</p>
              <p className="text-sm text-gray-500 mt-2">
                Extracting text and parsing medicine data. This may take a few moments.
              </p>
            </div>
          </div>

        /* ── OCR Step ─────────────────────────────────────────────────── */
        ) : step === 'ocr' ? (
          <div className="space-y-4">
            <div className="py-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🔍</span>
                <h3 className="text-lg font-medium text-gray-700">Running Client-Side OCR</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Extracting text from scanned PDF images. This runs entirely in your browser — no data sent to external OCR services.
              </p>
              <OcrProgressBar {...ocrProgress} />
            </div>
          </div>

        /* ── Preview Step ─────────────────────────────────────────────── */
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Review and select medicines to import ({selectedRows.size} selected)
                </p>
                <p className="text-xs text-gray-500">
                  Blank fields can be edited here before import.
                </p>
              </div>
              {pdfType && (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  pdfType === 'searchable'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {pdfType === 'searchable' ? '✅ Searchable PDF' : '🔍 Scanned PDF (OCR)'}
                </span>
              )}
            </div>
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.5fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Company for all medicines</label>
                <select
                  value={selectedCompany}
                  onChange={(event) => handleCompanySelect(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Create new company</label>
                <div className="flex gap-2">
                  <Input
                    value={newCompany}
                    onChange={(event) => setNewCompany(event.target.value)}
                    placeholder="Company name"
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateCompany}
                    disabled={!newCompany.trim() || creatingCompany}
                  >
                    {creatingCompany ? 'Saving...' : 'Create'}
                  </Button>
                </div>
              </div>
            </div>
            {parseError && (
              <ErrorBanner errorCode={errorCode} message={parseError} />
            )}

            <div className="border rounded-lg overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selectedRows.size === preview.length}
                        onCheckedChange={toggleSelectAll}
                        disabled={sequentialImport}
                      />
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Medicine Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>HSN</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Packing</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>Trade Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((medicine, index) => {
                    const category = medicine.category || detectCategory(medicine.packing || medicine.name);
                    const packagingOptions = PACKAGING_OPTIONS[category] || [];
                    const isCurrentImporting = sequentialImport && currentImportIndex === index;
                    const isDisabled = sequentialImport;
                    return (
                    <TableRow key={index} className={isCurrentImporting ? 'bg-blue-50 border-blue-200' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(index)}
                          onCheckedChange={() => toggleRowSelection(index)}
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {medicine.status === 'pending' && <span className="text-gray-400">⏳</span>}
                          {medicine.status === 'importing' && <span className="text-blue-500 animate-spin">🔄</span>}
                          {medicine.status === 'imported' && <span className="text-green-500">✅</span>}
                          {medicine.status === 'failed' && <span className="text-red-500">❌</span>}
                          <span className="text-xs text-gray-500">
                            {medicine.status === 'failed' && medicine.error ? medicine.error : medicine.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.name}
                          onChange={(e) => updatePreviewField(index, 'name', e.target.value)}
                          className="min-w-44"
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.company || ''}
                          onChange={(e) => updatePreviewField(index, 'company', e.target.value)}
                          className="min-w-32"
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={category}
                          onChange={(e) => handleCategoryChange(index, e.target.value)}
                          className="h-9 min-w-28 rounded-md border border-input bg-background px-2 text-sm"
                          disabled={isDisabled}
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.hsn || ''}
                          onChange={(e) => updatePreviewField(index, 'hsn', e.target.value)}
                          className="min-w-24"
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.barcode || ''}
                          onChange={(e) => updatePreviewField(index, 'barcode', e.target.value)}
                          className="min-w-28"
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={medicine.packing || ''}
                          onChange={(e) => updatePreviewField(index, 'packing', e.target.value)}
                          className="h-9 min-w-24 rounded-md border border-input bg-background px-2 text-sm"
                          disabled={isDisabled}
                        >
                          <option value="">Select</option>
                          {packagingOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={typeof medicine.mrp === 'number' ? medicine.mrp : ''}
                          onChange={(e) => updatePreviewField(index, 'mrp', e.target.value)}
                          className="min-w-24"
                          disabled={isDisabled}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={typeof medicine.tradePrice === 'number' ? medicine.tradePrice : ''}
                          onChange={(e) => updatePreviewField(index, 'tradePrice', e.target.value)}
                          className="min-w-24"
                          disabled={isDisabled}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {sequentialImport && importProgress.completed + importProgress.failed === importProgress.total && importProgress.total > 0 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">
                  ✅ Import completed: {importProgress.completed} imported, {importProgress.failed} skipped/failed
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetModal} disabled={loading || sequentialImport || step === 'ocr'}>
            Cancel
          </Button>
          {step === 'upload' ? (
            <Button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Starting Import...' : 'Parse File'}
            </Button>
          ) : step === 'ocr' ? (
            <Button disabled className="bg-blue-600">
              OCR Running...
            </Button>
          ) : step === 'preview' ? (
            <div className="flex gap-2">
              {sequentialImport && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mr-4">
                  <span>Importing {importProgress.completed + 1} of {importProgress.total}</span>
                  {importProgress.failed > 0 && (
                    <span className="text-red-500">({importProgress.failed} failed)</span>
                  )}
                </div>
              )}
              <Button
                onClick={handleSequentialImport}
                disabled={selectedRows.size === 0 || loading || sequentialImport}
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
              >
                {sequentialImport ? 'Importing...' : `Import One by One (${selectedCount})`}
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedRows.size === 0 || loading || sequentialImport}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? 'Importing...' : `Import Selected (${selectedCount})`}
              </Button>
            </div>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
