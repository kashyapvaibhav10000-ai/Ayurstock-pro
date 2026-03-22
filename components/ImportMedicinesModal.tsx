'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, CheckCircle2, Loader2, Play, UploadCloud, FileCog, FileCheck2 } from 'lucide-react';

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
      case 'loading': return 'Loading Document...';
      case 'rendering': return `Rendering Pages (${page}/${totalPages})`;
      case 'ocr': return `Extracting Text (${page}/${totalPages})`;
      case 'done': return 'Extraction Complete';
      case 'error': return 'Extraction Failed';
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
  const [provider, setProvider] = useState<string>('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [newCompany, setNewCompany] = useState<string>('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [sequentialImport, setSequentialImport] = useState(false);
  const [currentImportIndex, setCurrentImportIndex] = useState<number>(-1);
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompleted = useRef(false);
  const previewRef = useRef<MedicineWithStatus[]>([]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // OCR progress state
  const [ocrProgress, setOcrProgress] = useState({
    phase: 'loading',
    page: 0,
    totalPages: 0,
    percent: 0,
    message: '',
  });

  const abortControllerRef = useRef<AbortController | null>(null);
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
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setLoading(true);
    setParseError('');
    setErrorCode('');
    setStep('processing');
    
    abortControllerRef.current = new AbortController();

    try {
      let extractedText = '';
      
      // If it's a PDF, try to extract native text first
      if (file.type === 'application/pdf') {
        try {
          const { extractTextFromPdf } = await import('@/lib/pdfOcrClient');
          extractedText = await extractTextFromPdf(file);
        } catch (err) {
          console.error("Native PDF text extraction failed:", err);
        }
      }

      // If we got enough text, we send it to AI natively.
      // If not, it's either a scanned PDF or an image, so we prompt for OCR.
      if (extractedText && extractedText.trim().length > 50) {
        const formData = new FormData();
        formData.append('extractedText', extractedText);

        const headers: Record<string, string> = {};
        const authToken = token || localStorage.getItem('token');
        
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await axios.post('/api/medicines/import', formData, {
          headers,
          signal: abortControllerRef.current.signal,
        });

        if (response.status === 202 && response.data.jobId) {
          setJobId(response.data.jobId);
          startPolling(response.data.jobId);
        } else {
          throw new Error('Unexpected response signature from import route.');
        }
      } else {
        // Scanned PDF detected — offer OCR option
        setPdfType('scanned');
        setErrorCode('NO_TEXT');
        setParseError('This file appears to be a scanned document or image. Please run OCR to extract text.');
        setStep('upload');
      }
    } catch (error: any) {
      const data = axios.isAxiosError(error) ? error.response?.data : null;
      
      if (data?.errorCode === 'NO_TEXT') {
        setPdfType('scanned');
        setErrorCode('NO_TEXT');
        setParseError(data?.message || 'This file appears to be a scanned document.');
        setStep('upload');
      } else {
        const serverMessage = data?.message || data?.errorMessage || '';
        const errorMsg = serverMessage || (error?.message || 'Failed to process file');
        setErrorCode(data?.errorCode || '');
        setParseError(errorMsg);
        setStep('upload');
        if (axios.isCancel(error)) {
          toast.warning('Import process was cancelled');
        } else {
          toast.error(errorMsg);
        }
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelProcess = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStep('upload');
    setLoading(false);
    toast.info('Processing cancelled');
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

      if (response.status === 202 && response.data.jobId) {
        setJobId(response.data.jobId);
        startPolling(response.data.jobId);
      } else {
        throw new Error('Unexpected response signature from import route.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR processing failed';
      setParseError(message);
      setErrorCode('');
      setStep('upload');
    }
  };

  const startPolling = (jobId: string) => {
    hasCompleted.current = false;
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const poll = async () => {
      try {
        const response = await axios.get(`/api/medicines/import/status/${jobId}`);
        if (response.data.success) {
          const jobData = response.data;

          if (jobData.status === 'done') {
            if (hasCompleted.current) return;
            hasCompleted.current = true;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }

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
            previewRef.current = normalized;
            setSelectedRows(new Set(Array.from({ length: normalized.length }, (_, i) => i)));
            toast.success(`Successfully extracted ${normalized.length} medicines`);
            setStep('preview');
          } else if (jobData.status === 'failed') {
            if (hasCompleted.current) return;
            hasCompleted.current = true;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }

            setParseError(jobData.error || 'Import failed');
            setErrorCode(jobData.errorCode || '');
            if (jobData.errorCode === 'NO_TEXT') {
               setPdfType('scanned');
               setParseError(jobData.error || 'This file appears to be a scanned document or image. Please run OCR to extract text.');
            }
            setStep('upload');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setParseError('Failed to check import progress');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setStep('upload');
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
    setPreview((current) => {
      const updated = current.map((medicine, medicineIndex) => {
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
      });
      previewRef.current = updated;
      return updated;
    });
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
    setPreview((current) => {
      const cloned = JSON.parse(JSON.stringify(current)) as MedicineWithStatus[];
      previewRef.current = cloned.map((row) => {
        row.company = company;
        return row;
      });
      return previewRef.current;
    });
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
    setPreview((current) => {
      const updated = current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        const nextPacking = options.length > 0 ? options[0] : row.packing || '';
        return {
          ...row,
          category: nextCategory,
          packing: nextPacking,
        };
      });
      previewRef.current = updated;
      return updated;
    });
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
    console.log('Total items in previewRef:', previewRef.current?.length);
    const selectedMedicines = Array.from(selectedRows).map((index) => previewRef.current[index]).filter(Boolean);
    console.log('Selected medicines passing to handleSave:', selectedMedicines.length);
    
    setLoading(true);
    try {
      await onSuccess(selectedMedicines);
      toast.success(`${selectedMedicines.length} medicines confirmed and queued for save`);
      resetModal();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : 'Failed to save medicines';
      setParseError(message || 'Failed to save medicines');
      toast.error(message || 'Failed to save medicines');
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setFile(null);
    setPreview([]);
    previewRef.current = [];
    setSelectedRows(new Set());
    setStep('upload');
    setParseError('');
    setErrorCode('');
    setPdfType('');
    setProvider('');
    setSequentialImport(false);
    setCurrentImportIndex(-1);
    setImportProgress({ completed: 0, total: 0, failed: 0 });
    setJobId(null);
    stopPolling();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetModal()}>
      <DialogContent 
        className="flex flex-col p-0 gap-0 bg-surface border-surface-border"
        style={{
          resize: 'both',
          overflow: 'auto',
          minWidth: '600px',
          minHeight: '400px',
          width: '85vw',
          height: '85vh',
          maxWidth: '95vw',
          maxHeight: '95vh'
        }}
      >
        <DialogHeader className="px-6 py-4 border-b border-surface-border bg-slate-50 shrink-0">
          <DialogTitle className="text-xl">Import Medicines</DialogTitle>
          <div className="flex items-center justify-between mt-4">
            <div className="flex space-x-6">
              <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-primary font-bold' : 'text-text-secondary'}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === 'upload' ? 'bg-primary text-white' : 'bg-slate-200'}`}>1</div>
                <span>Upload File</span>
              </div>
              <div className="w-12 border-t-2 border-slate-200 my-auto" />
              <div className={`flex items-center gap-2 ${step === 'processing' || step === 'ocr' ? 'text-primary font-bold' : 'text-text-secondary'}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === 'processing' || step === 'ocr' ? 'bg-primary text-white' : 'bg-slate-200'}`}>2</div>
                <span>Processing</span>
              </div>
              <div className="w-12 border-t-2 border-slate-200 my-auto" />
              <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-primary font-bold' : 'text-text-secondary'}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === 'preview' ? 'bg-primary text-white' : 'bg-slate-200'}`}>3</div>
                <span>Review & Edit</span>
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {/* ── Upload Step ────────────────────────────────────────────── */}
        {step === 'upload' ? (
          <div className="space-y-6 max-w-2xl mx-auto py-8">
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
                <UploadCloud className="h-12 w-12 mx-auto text-primary mb-4" />
                <p className="text-lg font-medium text-text-primary">
                  Drag & Drop Invoice File
                </p>
                <p className="text-sm text-text-secondary mt-1">Accepts PDF, PNG, JPG</p>
                <Button variant="outline" className="mt-6 gap-2" type="button">
                  Browse Files
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
          <div className="space-y-6 max-w-lg mx-auto py-16 text-center">
            <div className="relative h-24 w-24 mx-auto">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
              <FileCog className="absolute inset-0 m-auto h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-text-primary">AI is processing your file...</p>
              <p className="text-sm text-text-secondary mt-2">
                Extracting structured medicine data. This may take 15-30 seconds.
              </p>
              {file && (
                 <p className="text-sm font-medium bg-slate-100 px-3 py-1 rounded-full inline-block mt-4 text-slate-700">
                   {file.name}
                 </p>
              )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-primary-light/50 p-4 rounded-xl border border-primary/20">
              <div className="flex items-start gap-3">
                <FileCheck2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-primary-hover">Review & Edit Extracted Data</h3>
                  <p className="text-sm text-primary-hover/80 mt-0.5">
                    Carefully review the fields below. You can edit any mistakes before saving to the database.
                  </p>
                </div>
              </div>
              {provider && (
                 <span className="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium ml-auto whitespace-nowrap">
                   {provider === 'gemini' ? 'Processed by Google Gemini ✓' : provider === 'groq' ? 'Processed by Groq ✓' : 'Processed by OpenRouter (slow mode) ✓'}
                 </span>
              )}
              <div className="mt-3 sm:mt-0 whitespace-nowrap text-sm font-semibold text-primary">
                {selectedRows.size} Selected
              </div>
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
        </div>

        <DialogFooter className="border-t border-surface-border bg-slate-50 p-6 shrink-0 flex items-center justify-between w-full">
          <div>
            {step === 'processing' && (
              <Button variant="destructive" onClick={handleCancelProcess} className="gap-2">
                Abort Process
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={resetModal} disabled={loading || sequentialImport || step === 'ocr'}>
              Cancel
            </Button>
            {step === 'upload' ? (
              <Button
                onClick={handleUpload}
                disabled={!file || loading}
                className="bg-primary hover:bg-primary-hover text-white gap-2 min-w-[140px]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {loading ? 'Starting...' : 'Start Import'}
              </Button>
            ) : step === 'ocr' ? (
              <Button disabled className="bg-primary hover:bg-primary-hover gap-2 min-w-[140px]">
                <Loader2 className="h-4 w-4 animate-spin" />
                OCR Running...
              </Button>
            ) : step === 'preview' ? (
              <Button
                onClick={handleImport}
                disabled={selectedRows.size === 0 || loading || sequentialImport}
                className="bg-success-bg text-success-text hover:bg-emerald-200 border border-emerald-300 font-bold gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {loading ? 'Saving...' : 'Confirm & Save'}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
