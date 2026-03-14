'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Company {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
}

const emptyForm = {
  id: '',
  name: '',
  description: '',
};

export default function CompanySettings() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  useEffect(() => {
    void loadCompanies();
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timer = setTimeout(() => setSuccessMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/companies');
      if (response.data.success) {
        setCompanies(response.data.data);
      }
    } catch (loadError) {
      console.error('Failed to load companies:', loadError);
      setError('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');

    try {
      const response = formData.id
        ? await axios.put('/api/companies', formData)
        : await axios.post('/api/companies', formData);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save company');
      }

      setSuccessMessage(response.data.message || 'Company saved successfully');
      resetForm();
      await loadCompanies();
    } catch (submitError) {
      const message = axios.isAxiosError(submitError)
        ? submitError.response?.data?.message
        : 'Failed to save company';
      setError(message || 'Failed to save company');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await axios.delete('/api/companies', {
        params: { id: deleteTarget.id },
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to delete company');
      }

      setSuccessMessage(response.data.message || 'Company deleted successfully');
      setDeleteTarget(null);
      await loadCompanies();
    } catch (deleteError) {
      const message = axios.isAxiosError(deleteError)
        ? deleteError.response?.data?.message
        : 'Failed to delete company';
      setError(message || 'Failed to delete company');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Company Management</CardTitle>
            <CardDescription>
              Manage the medicine companies available across medicine forms and imports.
            </CardDescription>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              setFormData(emptyForm);
              setError('');
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add Company
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {successMessage ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-slate-500">
                      Loading companies...
                    </TableCell>
                  </TableRow>
                ) : companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-slate-500">
                      No companies added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  companies.map((company) => (
                    <TableRow key={company.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium text-slate-900">{company.name}</TableCell>
                      <TableCell>{new Date(company.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => {
                              setFormData({
                                id: company.id,
                                name: company.name,
                                description: company.description || '',
                              });
                              setError('');
                              setShowForm(true);
                            }}
                            title="Edit company"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => setDeleteTarget(company)}
                            title="Delete company"
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

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{formData.id ? 'Edit Company' : 'Add Company'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={formData.name}
                onChange={(e) => setFormData((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-description">Description</Label>
              <Input
                id="company-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {formData.id ? 'Save Changes' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete this company?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
