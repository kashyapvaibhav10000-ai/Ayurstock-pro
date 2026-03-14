'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Search, Trash2, Upload, Boxes } from 'lucide-react';
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
import ImportPriceList from '@/components/medicine/import-price-list';
import { EditableMedicine } from '@/components/MedicineEditModal';

interface Medicine extends EditableMedicine {
  hsn: string;
  isActive: boolean;
  availableStock?: number;
  packing?: string | null;
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

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPriceListModal, setShowPriceListModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedAll, setSelectedAll] = useState(false);
  const [selectedMedicines, setSelectedMedicines] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditableMedicine & { packing?: string | null } | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  useEffect(() => {
    void Promise.all([loadMedicines(), loadCompanies()]);
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timer = setTimeout(() => setSuccessMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timer = setTimeout(() => setErrorMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }
      if (selectedMedicines.size > 0) {
        setShowDeleteModal(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedMedicines]);

  const visibleMedicines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const filtered = medicines.filter((medicine) => {
      if (activeFilter === 'All') {
        return true;
      }
      if (activeFilter === 'Imported Today') {
        if (!medicine.createdAt) {
          return false;
        }
        return new Date(medicine.createdAt).getTime() >= todayStart.getTime();
      }
      return (medicine.category || '').toLowerCase() === activeFilter.toLowerCase();
    });

    if (!query) {
      return filtered;
    }

    return filtered.filter((medicine) =>
      [
        medicine.name,
        medicine.company,
        medicine.category,
        medicine.barcode || '',
        medicine.packing || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [medicines, searchQuery, activeFilter]);

  const selectedMedicinesData = medicines.filter((medicine) => selectedMedicines.has(medicine.id));

  const loadMedicines = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/medicines/search', {
        params: { query: '', limit: 200 },
      });

      if (response.data.success) {
        setMedicines(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load medicines:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await axios.post('/api/medicines/search', formData);
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to add medicine');
      }

      setFormData(emptyForm);
      setShowForm(false);
      setSuccessMessage('Medicine added successfully');
      await loadCompanies();
      await loadMedicines();
    } catch (error) {
      console.error('Failed to add medicine:', error);
      alert('Failed to add medicine');
    }
  };

  const handleImportSuccess = async (parsedMedicines: ParsedMedicine[]) => {
    const response = await axios.post('/api/medicines/bulk-insert', {
      medicines: parsedMedicines,
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to import medicines');
    }

    setSuccessMessage(response.data.message || 'Medicines imported successfully');
    setShowImportModal(false);
    await loadCompanies();
    await loadMedicines();
  };

  const handleDeleteMedicine = async (medicine: Medicine) => {
    const confirmed = window.confirm(`Delete ${medicine.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await axios.delete('/api/medicine/update', {
        params: { id: medicine.id },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete medicine');
      }

      setSuccessMessage(response.data.message || 'Medicine deleted successfully');
      setSelectedMedicines((current) => {
        const next = new Set(current);
        next.delete(medicine.id);
        return next;
      });
      await loadMedicines();
    } catch (error) {
      console.error('Delete medicine error:', error);
      alert('Failed to delete medicine');
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
      setSuccessMessage('Medicines deleted successfully');
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
      setErrorMessage(message || 'Failed to delete medicines');
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
    if (!editDraft) {
      return;
    }

    try {
      await axios.put('/api/medicine/update', editDraft);
      setSuccessMessage('Medicine updated successfully');
      setEditingRowId(null);
      setEditDraft(null);
      await loadMedicines();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : 'Failed to update medicine';
      setErrorMessage(message || 'Failed to update medicine');
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

    setSelectedMedicines(new Set(visibleMedicines.map((medicine) => medicine.id)));
    setSelectedAll(true);
  };

  useEffect(() => {
    setSelectedAll(
      visibleMedicines.length > 0 &&
        visibleMedicines.every((medicine) => selectedMedicines.has(medicine.id))
    );
  }, [visibleMedicines, selectedMedicines]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading medicines...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Medicines</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your medicine master and move selected items into inventory when stock arrives.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine, company, barcode..."
              className="pl-9"
            />
          </div>
          <Button variant="outline" className="gap-2" onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4" />
            Import Medicines
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setShowPriceListModal(true)}>
            <Upload className="h-4 w-4" />
            Import Price List
          </Button>
          <Button className="gap-2" onClick={() => setShowForm((current) => !current)}>
            <Plus className="h-4 w-4" />
            Add Medicine
          </Button>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {showForm ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Add New Medicine</CardTitle>
            <CardDescription>Create medicine master records before stocking them in inventory.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMedicine} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-name">Medicine Name</Label>
                <Input
                  id="medicine-create-name"
                  value={formData.name}
                  onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
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
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-category">Category</Label>
                <Input
                  id="medicine-create-category"
                  value={formData.category}
                  onChange={(e) => setFormData((current) => ({ ...current, category: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-barcode">Barcode</Label>
                <Input
                  id="medicine-create-barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData((current) => ({ ...current, barcode: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medicine-create-hsn">HSN</Label>
                <Input
                  id="medicine-create-hsn"
                  value={formData.hsn}
                  onChange={(e) => setFormData((current) => ({ ...current, hsn: e.target.value }))}
                  required
                />
              </div>
              <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                <Button type="submit">Save Medicine</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Medicine Master</CardTitle>
            <CardDescription>
              {visibleMedicines.length} medicines available. Imported medicines stay here until you move them to inventory.
            </CardDescription>
          </div>
          {selectedMedicines.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-full bg-sky-50 px-4 py-2 text-sm text-sky-700">
              <span>{selectedMedicines.size} selected</span>
              <Button size="sm" className="gap-2" onClick={() => setShowMoveModal(true)}>
                <Boxes className="h-4 w-4" />
                Move to Inventory
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-hidden">
          <div className="mb-4 flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeFilter === filter
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox checked={selectedAll} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Packing</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMedicines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No medicines found.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleMedicines.map((medicine) => (
                    <TableRow key={medicine.id} className="hover:bg-gray-50">
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
                      <TableCell>
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
                      <TableCell>{medicine.barcode || '-'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
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
                              variant="outline"
                              onClick={() => startInlineEdit(medicine)}
                              title="Quick edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleDeleteMedicine(medicine)}
                            title="Delete medicine"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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

      <ImportPriceList
        isOpen={showPriceListModal}
        onClose={() => setShowPriceListModal(false)}
        onSuccess={async (count) => {
          setSuccessMessage(`${count} medicines imported successfully from price list`);
          await loadCompanies();
          await loadMedicines();
        }}
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
