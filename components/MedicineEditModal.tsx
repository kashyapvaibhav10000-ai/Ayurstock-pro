'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface EditableMedicine {
  id: string;
  name: string;
  company: string;
  category: string;
  barcode?: string;
  gstPercent?: number;
}

const GST_OPTIONS = [
  { value: 5, label: '5%', category: 'Standard' },
  { value: 12, label: '12%', category: 'Proprietary' },
  { value: 18, label: '18%', category: 'Cosmetic' },
];

interface CompanyOption {
  id: string;
  name: string;
}

interface MedicineEditModalProps {
  isOpen: boolean;
  medicine: EditableMedicine | null;
  companies: CompanyOption[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function MedicineEditModal({
  isOpen,
  medicine,
  companies,
  onClose,
  onSaved,
}: MedicineEditModalProps) {
  const [formData, setFormData] = useState<EditableMedicine | null>(medicine);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(medicine);
    setError('');
  }, [medicine]);

  const handleSubmit = async () => {
    if (!formData) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.put('/api/medicine/update', formData);
      await onSaved();
      onClose();
    } catch (submitError) {
      const message = axios.isAxiosError(submitError)
        ? submitError.response?.data?.message
        : 'Failed to update medicine';
      setError(message || 'Failed to update medicine');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Medicine</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="medicine-name">Medicine Name</Label>
            <Input
              id="medicine-name"
              value={formData?.name || ''}
              onChange={(e) =>
                setFormData((current) =>
                  current ? { ...current, name: e.target.value } : current
                )
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="medicine-company">Company</Label>
            <select
              id="medicine-company"
              value={formData?.company || ''}
              onChange={(e) =>
                setFormData((current) =>
                  current ? { ...current, company: e.target.value } : current
                )
              }
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <Label htmlFor="medicine-category">Category</Label>
            <Input
              id="medicine-category"
              value={formData?.category || ''}
              onChange={(e) =>
                setFormData((current) =>
                  current ? { ...current, category: e.target.value } : current
                )
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="medicine-barcode">Barcode</Label>
            <Input
              id="medicine-barcode"
              value={formData?.barcode || ''}
              onChange={(e) =>
                setFormData((current) =>
                  current ? { ...current, barcode: e.target.value } : current
                )
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>GST Rate *</Label>
            <div className="flex gap-2">
              {GST_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setFormData((current) =>
                      current ? { ...current, gstPercent: opt.value } : current
                    )
                  }
                  className={`flex-1 flex flex-col items-center justify-center rounded-md border p-2 transition-all ${
                    (formData?.gstPercent || 5) === opt.value
                      ? 'bg-primary border-primary text-white'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="text-sm font-bold">{opt.label}</span>
                  <span className="text-[10px] opacity-80 font-normal">{opt.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
