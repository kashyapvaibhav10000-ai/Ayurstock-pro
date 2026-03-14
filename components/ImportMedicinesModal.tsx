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

interface ImportMedicinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (medicines: ParsedMedicine[]) => Promise<void>;
}

export default function ImportMedicinesModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportMedicinesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedMedicine[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [parseError, setParseError] = useState<string>('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [newCompany, setNewCompany] = useState<string>('');
  const [creatingCompany, setCreatingCompany] = useState(false);

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
        return;
      }
      setFile(selectedFile);
      setParseError('');
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

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {
        'Content-Type': 'multipart/form-data',
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await axios.post('/api/medicines/import', formData, {
        headers,
      });

      if (response.data.success) {
        const normalized = (response.data.data || []).map((row: ParsedMedicine) => {
          const category = row.category || detectCategory(row.packing || row.name);
          const options = PACKAGING_OPTIONS[category] || [];
          const packing = row.packing || (options.length > 0 ? options[0] : '');
          return {
            ...row,
            category,
            packing,
          };
        });
        setPreview(normalized);
        setSelectedRows(new Set(Array.from({ length: response.data.data.length }, (_, i) => i)));
        setStep('preview');
      } else {
        setParseError(response.data.message || 'Failed to parse file');
      }
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : 'Failed to upload file';
      setParseError(message || 'An error occurred');
    } finally {
      setLoading(false);
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
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetModal()}>
      <DialogContent className="max-w-7xl">
        <DialogHeader>
          <DialogTitle>Import Medicines</DialogTitle>
        </DialogHeader>

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
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm">
                  <strong>Selected:</strong> {file.name}
                </p>
              </div>
            )}

            {parseError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{parseError}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Review and select medicines to import ({selectedRows.size} selected)
            </p>
            <p className="text-xs text-gray-500">
              Blank fields can be edited here before import.
            </p>
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{parseError}</p>
              </div>
            )}

            <div className="border rounded-lg overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selectedRows.size === preview.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
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
                  {preview.map((medicine, index) => (
                    (() => {
                      const category = medicine.category || detectCategory(medicine.packing || medicine.name);
                      const packagingOptions = PACKAGING_OPTIONS[category] || [];
                      return (
                    <TableRow key={index}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(index)}
                          onCheckedChange={() => toggleRowSelection(index)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.name}
                          onChange={(e) => updatePreviewField(index, 'name', e.target.value)}
                          className="min-w-44"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.company || ''}
                          onChange={(e) => updatePreviewField(index, 'company', e.target.value)}
                          className="min-w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={category}
                          onChange={(e) => handleCategoryChange(index, e.target.value)}
                          className="h-9 min-w-28 rounded-md border border-input bg-background px-2 text-sm"
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
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.barcode || ''}
                          onChange={(e) => updatePreviewField(index, 'barcode', e.target.value)}
                          className="min-w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={medicine.packing || ''}
                          onChange={(e) => updatePreviewField(index, 'packing', e.target.value)}
                          className="h-9 min-w-24 rounded-md border border-input bg-background px-2 text-sm"
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
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={typeof medicine.tradePrice === 'number' ? medicine.tradePrice : ''}
                          onChange={(e) => updatePreviewField(index, 'tradePrice', e.target.value)}
                          className="min-w-24"
                        />
                      </TableCell>
                    </TableRow>
                      );
                    })()
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetModal} disabled={loading}>
            Cancel
          </Button>
          {step === 'upload' ? (
            <Button
              onClick={handleUpload}
              disabled={!file || loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Processing...' : 'Parse File'}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={selectedRows.size === 0 || loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Importing...' : `Import Selected (${selectedCount})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
