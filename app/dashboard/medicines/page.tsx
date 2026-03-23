'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { toast } from 'sonner';
import { Pencil, Plus, Search, Trash2, Upload, Boxes, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ImportMedicinesModal, { ParsedMedicine } from '@/components/ImportMedicinesModal';
import MoveToInventoryModal from '@/components/MoveToInventoryModal';
import { EditableMedicine } from '@/components/MedicineEditModal';

interface Medicine extends EditableMedicine {
  hsn: string;
  isActive: boolean;
  availableStock?: number;
  packing?: string | null;
  mrp?: number | null;
  createdAt?: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

const emptyForm = {
  name: '',
  company: '',
  category: '',
  barcode: '',
  hsn: '',
  gstPercent: 0,
};

const CATEGORY_OPTIONS = [
  'All',
  'Tablet',
  'Capsule',
  'Powder',
  'Churna',
  'Asav',
  'Syrup',
  'Oil',
  'Cream',
  'Imported Today',
];

const CATEGORY_VALUES = [
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
  Oil: ['50 ml', '100 ml', '200 ml', '500 ml'],
  Cream: ['15 gm', '30 gm', '50 gm'],
  Gel: ['15 gm', '30 gm', '50 gm'],
  Drops: ['10 ml', '15 ml', '30 ml'],
  Bhasma: ['10 gm', '25 gm', '50 gm'],
  Vati: ['10 Tab', '20 Tab', '30 Tab', '60 Tab'],
  Chawanprash: ['250 gm', '500 gm', '1 kg'],
  Other: [],
};

const PAGE_SIZE = 200;

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAll, setSelectedAll] = useState(false);
  const [selectedMedicines, setSelectedMedicines] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState(emptyForm);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditableMedicine & { packing?: string | null } | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [companyFilter, setCompanyFilter] = useState('');
  const [mrpMin, setMrpMin] = useState('');
  const [mrpMax, setMrpMax] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  useEffect(() => {
    if (isAuthorized) {
      loadCompanies();
    }
  }, [isAuthorized]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (selectedMedicines.size > 0) setShowDeleteModal(true);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedMedicines]);

  const visibleMedicines = medicines;
  const selectedMedicinesData = medicines.filter((m) => selectedMedicines.has(m.id));

  const hasActiveFilters = activeFilter !== 'All' || companyFilter !== '' || mrpMin !== '' || mrpMax !== '';

  const loadMedicines = async (
    page = currentPage,
    query = searchQuery,
    filter = activeFilter,
    company = companyFilter,
    minMrp = mrpMin,
    maxMrp = mrpMax,
  ) => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        query,
        category: filter,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (company) params.company = company;
      if (minMrp !== '') params.mrp_min = minMrp;
      if (maxMrp !== '') params.mrp_max = maxMrp;

      const response = await axios.get('/api/medicines/search', { params });
      if (response.data.success) {
        setMedicines(response.data.data);
        setTotalCount(response.data.total);
      }
    } catch (error) {
      console.error('Failed to load medicines:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      const timer = setTimeout(() => {
        loadMedicines(currentPage, searchQuery, activeFilter, companyFilter, mrpMin, mrpMax);
      }, searchQuery ? 500 : 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthorized, currentPage, activeFilter, companyFilter, mrpMin, mrpMax, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter, companyFilter, mrpMin, mrpMax]);

  const loadCompanies = async () => {
    try {
      const response = await axios.get('/api/companies');
      if (response.data.success) {
        setCompanies(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load companies:', error);
    }
  };

  const clearFilters = () => {
    setActiveFilter('All');
    setCompanyFilter('');
    setMrpMin('');
    setMrpMax('');
  };

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.name.trim().length < 3) {
      toast.error('Medicine name must be at least 3 characters long');
      return;
    }
    if (!formData.company) {
      toast.error('Please select a company');
      return;
    }
    if (!formData.category) {
      toast.error('Category is required');
      return;
    }
    if (formData.hsn && !/^\d{4,8}$/.test(formData.hsn)) {
      toast.error('HSN must be between 4 and 8 numeric digits');
      return;
    }
    if (formData.barcode && !/^\d+$/.test(formData.barcode)) {
      toast.error('Barcode must contain only numbers');
      return;
    }

    try {
      const response = await axios.post('/api/medicines/search', formData);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to add medicine');
      }

      setFormData(emptyForm);
      setShowAddModal(false);
      toast.success('Medicine added successfully. Ready for inventory.');
      await loadCompanies();
      await loadMedicines();
    } catch (error) {
      console.error('Failed to add medicine:', error);
      toast.error('Failed to add medicine');
    }
  };

  const handleImportSuccess = async (parsedMedicines: ParsedMedicine[]) => {
    const response = await axios.post('/api/medicines/bulk-insert', {
      medicines: parsedMedicines,
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to import medicines');
    }

    toast.success(response.data.message || 'Medicines imported successfully');
    setShowImportModal(false);
    await loadCompanies();
    await loadMedicines();
  };

  const handleDeleteMedicine = async (medicine: Medicine) => {
    const confirmed = window.confirm(`Delete ${medicine.name}?`);
    if (!confirmed) return;

    try {
      const response = await axios.delete('/api/medicine/update', {
        params: { id: medicine.id },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete medicine');
      }

      toast.success(response.data.message || 'Medicine deleted successfully');
      setSelectedMedicines((current) => {
        const next = new Set(current);
        next.delete(medicine.id);
        return next;
      });
      await loadMedicines();
    } catch (error) {
      console.error('Delete medicine error:', error);
      toast.error('Failed to delete medicine');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedMedicines);
    if (ids.length === 0) {
      setShowDeleteModal(false);
      return;
    }

    try {
      const response = await axios.post('/api/medicines/bulk-delete', { ids });
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete medicines');
      }
      toast.success('Medicines deleted successfully');
      setSelectedMedicines(new Set());
      setSelectedAll(false);
      setShowDeleteModal(false);
      await loadMedicines();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : 'Failed to delete medicines';
      toast.error(message || 'Failed to delete medicines');
      setShowDeleteModal(false);
    }
  };

  const startInlineEdit = (medicine: Medicine) => {
    setEditingRowId(medicine.id);
    setEditDraft({
      id: medicine.id,
      name: medicine.name,
      company: medicine.company,
      category: medicine.category,
      barcode: medicine.barcode,
      packing: medicine.packing || '',
    });
  };

  const cancelInlineEdit = () => {
    setEditingRowId(null);
    setEditDraft(null);
  };

  const saveInlineEdit = async () => {
    if (!editDraft) return;

    try {
      await axios.put('/api/medicine/update', editDraft);
      toast.success('Medicine updated successfully');
      setEditingRowId(null);
      setEditDraft(null);
      await loadMedicines();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : 'Failed to update medicine';
      toast.error(message || 'Failed to update medicine');
    }
  };

  const toggleMedicineSelection = (id: string) => {
    setSelectedMedicines((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAll) {
      setSelectedMedicines(new Set());
      setSelectedAll(false);
      return;
    }
    setSelectedMedicines(new Set(visibleMedicines.map((m) => m.id)));
    setSelectedAll(true);
  };

  useEffect(() => {
    setSelectedAll(
      visibleMedicines.length > 0 &&
        visibleMedicines.every((m) => selectedMedicines.has(m.id))
    );
  }, [visibleMedicines, selectedMedicines]);

  if (!isAuthorized) return null;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading medicines...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">Medicines</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your medicine master and move selected items into inventory when stock arrives.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:min-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine, company, barcode..."
              className="pl-9 rounded-2xl bg-surface shadow-soft border-surface-border transition-all focus-visible:shadow-bento"
            />
          </div>
          <Button variant="outline" className="gap-2 rounded-2xl shadow-soft hover:shadow-bento transition-all" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4" />
            Import Medicines
          </Button>
          <Button className="gap-2 rounded-2xl shadow-soft hover:shadow-bento transition-all" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Medicine
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Medicine Master</CardTitle>
            <CardDescription>
              {totalCount} medicines available. Imported medicines stay here until you move them to inventory.
            </CardDescription>
          </div>
          {selectedMedicines.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/10 px-4 py-2 text-sm text-primary font-bold shadow-soft">
              <span>{selectedMedicines.size} selected</span>
              <Button size="sm" className="gap-2 rounded-xl" onClick={() => setShowMoveModal(true)}>
                <Boxes className="h-4 w-4" />
                Move to Inventory
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2 rounded-xl"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-hidden">
          {/* Filter bar */}
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500">Category</Label>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-slate-500">Company</Label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:min-w-[160px]"
              >
                <option value="">All Companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-slate-500 hover:text-slate-900 self-end"
              >
                <X className="h-3.5 w-3.5" />
                Clear Filters
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <Table>
              <TableHeader className="bg-surface-muted/50">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={selectedAll} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="font-bold text-text-secondary">Medicine</TableHead>
                  <TableHead className="font-bold text-text-secondary">Company</TableHead>
                  <TableHead className="font-bold text-text-secondary">Category</TableHead>
                  <TableHead className="font-bold text-text-secondary hidden sm:table-cell">Packing</TableHead>
                  <TableHead className="font-bold text-text-secondary hidden lg:table-cell">Barcode</TableHead>
                  <TableHead className="font-bold text-text-secondary hidden md:table-cell">GST %</TableHead>
                  <TableHead className="text-right font-bold text-text-secondary">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMedicines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">
                      No medicines found.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleMedicines.map((medicine) => (
                    <TableRow key={medicine.id} className="group hover:bg-green-50/40 transition-colors duration-100">
                      <TableCell>
                        <Checkbox
                          checked={selectedMedicines.has(medicine.id)}
                          onCheckedChange={() => toggleMedicineSelection(medicine.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{medicine.name}</div>
                      </TableCell>
                      <TableCell>
                        {editingRowId === medicine.id ? (
                          <Input
                            value={editDraft?.company || ''}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current ? { ...current, company: e.target.value } : current
                              )
                            }
                            className="h-8"
                          />
                        ) : (
                          medicine.company
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRowId === medicine.id ? (
                          <select
                            value={editDraft?.category || ''}
                            onChange={(e) => {
                              const nextCategory = e.target.value;
                              const nextPacking = PACKAGING_OPTIONS[nextCategory]?.[0] || editDraft?.packing || '';
                              setEditDraft((current) =>
                                current
                                  ? { ...current, category: nextCategory, packing: nextPacking }
                                  : current
                              );
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {CATEGORY_VALUES.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          medicine.category
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {editingRowId === medicine.id ? (
                          <select
                            value={editDraft?.packing || ''}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current ? { ...current, packing: e.target.value } : current
                              )
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">Select</option>
                            {(PACKAGING_OPTIONS[editDraft?.category || ''] || []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          medicine.packing || '-'
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{medicine.barcode || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {editingRowId === medicine.id ? (
                          <select
                            value={(editDraft as any)?.gstPercent ?? 0}
                            onChange={(e) =>
                              setEditDraft((current) =>
                                current ? { ...current, gstPercent: Number(e.target.value) } as any : current
                              )
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                          </select>
                        ) : (
                          `${(medicine as any).gstPercent ?? 0}%`
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={`flex justify-end gap-2 transition-opacity duration-150 ${editingRowId === medicine.id ? 'opacity-100' : 'opacity-100 xl:opacity-0 xl:group-hover:opacity-100'}`}>
                          {editingRowId === medicine.id ? (
                            <>
                              <Button size="sm" variant="outline" onClick={cancelInlineEdit}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={saveInlineEdit}>
                                Save
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-text-muted hover:text-primary hover:bg-primary/10"
                              onClick={() => startInlineEdit(medicine)}
                              title="Quick edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-text-muted hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteMedicine(medicine)}
                            title="Delete medicine"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalCount > 0 && (
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-6">
              <p className="text-sm text-slate-500">
                Showing {Math.min(totalCount, (currentPage - 1) * PAGE_SIZE + 1)} to{' '}
                {Math.min(totalCount, currentPage * PAGE_SIZE)} of {totalCount} medicines
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={currentPage * PAGE_SIZE >= totalCount || loading}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Medicine Modal */}
      <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) { setShowAddModal(false); setFormData(emptyForm); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Medicine</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddMedicine} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="medicine-create-name">Medicine Name</Label>
              <Input
                id="medicine-create-name"
                value={formData.name}
                onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
                placeholder="e.g. Ashwagandha Churna"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="medicine-create-company">Company</Label>
              <select
                id="medicine-create-company"
                value={formData.company}
                onChange={(e) => setFormData((current) => ({ ...current, company: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.name}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-category">Category</Label>
                <select
                  id="medicine-create-category"
                  value={formData.category}
                  onChange={(e) => setFormData((current) => ({ ...current, category: e.target.value }))}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select category</option>
                  {CATEGORY_VALUES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-hsn">HSN</Label>
                <Input
                  id="medicine-create-hsn"
                  value={formData.hsn}
                  onChange={(e) => setFormData((current) => ({ ...current, hsn: e.target.value }))}
                  placeholder="e.g. 30049099"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-barcode">Barcode (optional)</Label>
                <Input
                  id="medicine-create-barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData((current) => ({ ...current, barcode: e.target.value }))}
                  placeholder="Numeric barcode"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-gst">GST %</Label>
                <select
                  id="medicine-create-gst"
                  value={formData.gstPercent}
                  onChange={(e) => setFormData((current) => ({ ...current, gstPercent: Number(e.target.value) }))}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); setFormData(emptyForm); }}>
                Cancel
              </Button>
              <Button type="submit">Add Medicine</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ImportMedicinesModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />

      <MoveToInventoryModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        medicines={selectedMedicinesData}
      />

      <Dialog open={showDeleteModal} onOpenChange={(open) => !open && setShowDeleteModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Medicines</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            You are about to delete {selectedMedicines.size} medicines from the Medicine Master.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
