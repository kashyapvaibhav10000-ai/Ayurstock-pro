'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import axios from 'axios';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddReturnModal({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  
  // Local state for dropdown sources
  const [medicines, setMedicines] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  
  // Form State
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('CUSTOMER');
  const [companyId, setCompanyId] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [mrp, setMrp] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
      // Reset Form State
      setCompanyId('');
      setMedicineId('');
      setBatchNumber('');
      setExpiryDate('');
      setMrp('');
      setQuantity('');
      setReason('');
      setNotes('');
      setError('');
    }
  }, [isOpen]);

  const loadDependencies = async () => {
    try {
      const [medRes, compRes] = await Promise.all([
        axios.get('/api/medicines'),
        axios.get('/api/companies')
      ]);
      setMedicines(medRes.data.data || []);
      setCompanies(compRes.data.data || []);
    } catch (err) {
      console.error('Failed to load modal dependencies:', err);
    }
  };

  const handleSubmit = async () => {
    if (!medicineId || !expiryDate || !mrp || !quantity || !reason || !companyId || !type) {
      setError('Please fill all required (*) fields');
      return;
    }

    if (Number(mrp) <= 0 || Number(quantity) <= 0) {
      setError('MRP and Quantity must be strictly greater than 0');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/returns', {
        type,
        companyId,
        medicineId,
        batchNumber,
        expiryDate,
        mrp: Number(mrp),
        quantity: Number(quantity),
        reason,
        notes
      });

      if (response.data.success) {
        toast({ title: 'Success', description: 'Medicine returned to inventory successfully!' });
        onSuccess(); // Triggers table reload
        onClose();
      } else {
        setError(response.data.message || 'Failed to process return');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Access Denied / Stock Exception');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Process New Return</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="col-span-2">
            <Label>Return Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select Return Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CUSTOMER">Customer Return (Adds to Stock)</SelectItem>
                <SelectItem value="SUPPLIER">Supplier Return (Removes from Stock)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Company Name *</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select Company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Medicine Name *</Label>
            <Select value={medicineId} onValueChange={setMedicineId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select Medicine" />
              </SelectTrigger>
              <SelectContent>
                {medicines.filter(m => !companyId || m.companyId === companyId || m.company === (companies.find(c => c.id === companyId)?.name)).map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name} ({m.packing || '-'})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Expiry Date *</Label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>MRP (₹) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Batch Number</Label>
            <Input
              placeholder="e.g. BTC-992"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="col-span-2 sm:col-span-1">
            <Label>Quantity Returned *</Label>
            <Input
              type="number"
              min="1"
              placeholder="Enter units"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="col-span-2">
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select Reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Damaged">Damaged</SelectItem>
                <SelectItem value="Wrong Medicine">Wrong Medicine</SelectItem>
                <SelectItem value="Customer Return">Customer Return</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Extra Notes</Label>
            <Textarea
              placeholder="Any additional context regarding this return (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !medicineId || !expiryDate || !mrp || !quantity || !reason || !companyId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? 'Processing...' : 'Process Return & Upsert Inventory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
