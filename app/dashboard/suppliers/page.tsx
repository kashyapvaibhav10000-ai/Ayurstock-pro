'use client';

import { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Trash2, 
  Edit, 
  History, 
  Loader2,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import axios from 'axios';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/suppliers');
      if (response.data.success) {
        setSuppliers(response.data.data);
      }
    } catch (error) {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleAddSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    
    try {
      const response = await axios.post('/api/suppliers', data);
      if (response.data.success) {
        toast.success('Supplier added successfully');
        setIsAddDialogOpen(false);
        fetchSuppliers();
      }
    } catch (error) {
      toast.error('Failed to add supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    
    try {
      const response = await axios.put(`/api/suppliers/${currentSupplier.id}`, data);
      if (response.data.success) {
        toast.success('Supplier updated successfully');
        setIsEditDialogOpen(false);
        fetchSuppliers();
      }
    } catch (error) {
      toast.error('Failed to update supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    
    try {
      await axios.delete(`/api/suppliers/${id}`);
      toast.success('Supplier deleted');
      fetchSuppliers();
    } catch (error) {
      toast.error('Failed to delete supplier');
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (s.city && s.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            Suppliers & Distributors
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Maintain your network of reliable medicine providers.
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 px-6 shadow-sm">
              <Plus className="h-4 w-4" />
              Add New Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleAddSupplier}>
              <DialogHeader>
                <DialogTitle>Add Supplier</DialogTitle>
                <DialogDescription>Enter contact details for the new distributor.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Supplier Name</Label>
                  <Input id="name" name="name" placeholder="ABC Distributors" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" placeholder="+91..." required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" placeholder="sales@abc.com" required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" name="address" placeholder="123 Pharma Street" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" name="city" placeholder="Mumbai" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input id="gstin" name="gstin" placeholder="Optional" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Supplier'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="relative w-full md:w-96">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
        <Input 
          placeholder="Search by name or city..." 
          className="pl-12 h-12 rounded-[20px] shadow-soft border-border bg-surface font-medium text-foreground focus:ring-4 focus:ring-primary/10 transition-all focus:shadow-bento outline-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/30" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-surface/50 rounded-2xl border-2 border-dashed border-border">
            <Building2 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">No suppliers found</h3>
            <p className="text-muted-foreground">Add your first supplier to track inventory sources.</p>
          </div>
        ) : (
          filteredSuppliers.map((supplier) => (
            <Card key={supplier.id} className="group hover:-translate-y-1 rounded-[24px] shadow-soft hover:shadow-bento transition-all duration-300 border-border bg-surface overflow-hidden">
              <CardHeader className="pb-3 border-b border-border bg-surface-muted/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-[16px] bg-background border border-border flex items-center justify-center shadow-sm text-primary">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-extrabold text-foreground tracking-tight">{supplier.name}</CardTitle>
                      <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate max-w-[150px]">{supplier.city || 'Location N/A'}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => {
                        setCurrentSupplier(supplier);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:bg-danger/20 hover:text-danger transition-colors"
                      onClick={() => handleDeleteSupplier(supplier.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm font-medium">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Phone className="h-4 w-4 text-muted-foreground/60" />
                    {supplier.phone}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Mail className="h-4 w-4 text-muted-foreground/60" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                  <div className="flex items-start gap-3 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground/60 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">{supplier.address}</span>
                  </div>
                </div>
                
                <div className="pt-5 mt-2 flex items-center justify-between border-t border-border">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground bg-surface-muted/50 px-3 py-1 rounded-lg">
                    {supplier._count?.purchases || 0} Purchases
                  </div>
                  <Button 
                    variant="link" 
                    className="h-auto p-0 text-xs font-bold text-primary hover:text-primary-hover gap-1.5 uppercase tracking-wide"
                    onClick={() => {
                      setCurrentSupplier(supplier);
                      setIsHistoryOpen(true);
                    }}
                  >
                    View History
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditSupplier}>
            <DialogHeader>
              <DialogTitle>Edit Supplier</DialogTitle>
              <DialogDescription>Update distributor contact details.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Supplier Name</Label>
                <Input id="edit-name" name="name" defaultValue={currentSupplier?.name} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" name="phone" defaultValue={currentSupplier?.phone} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" name="email" defaultValue={currentSupplier?.email} required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-address">Address</Label>
                <Input id="edit-address" name="address" defaultValue={currentSupplier?.address} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-city">City</Label>
                  <Input id="edit-city" name="city" defaultValue={currentSupplier?.city} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-gstin">GSTIN</Label>
                  <Input id="edit-gstin" name="gstin" defaultValue={currentSupplier?.gstin} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-[600px] h-[500px] flex flex-col p-0">
          <div className="p-6 border-b">
             <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Purchase History: {currentSupplier?.name}
                </DialogTitle>
                <DialogDescription>Recent invoices associated with this distributor.</DialogDescription>
              </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-surface">
             <div className="space-y-4">
                {currentSupplier?.purchases?.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground/40 font-bold uppercase text-xs tracking-widest">No purchase records found.</div>
                ) : (
                  currentSupplier?.purchases?.map((p: any) => (
                    <div key={p.id} className="p-4 bg-surface-muted/30 rounded-xl border border-border shadow-sm flex items-center justify-between group-hover:bg-primary/5 transition-colors">
                       <div>
                         <div className="font-bold text-foreground">{p.invoiceNumber}</div>
                         <div className="text-xs text-muted-foreground">{new Date(p.invoiceDate).toLocaleDateString()}</div>
                       </div>
                       <div className="text-right">
                         <div className="font-bold text-foreground">₹{p.totalAmount}</div>
                         <div className={`text-[10px] font-bold ${p.status === 'PAID' ? 'text-primary' : 'text-orange-400'}`}>
                           {p.status}
                         </div>
                       </div>
                    </div>
                  ))
                )}
             </div>
          </div>
          <div className="p-4 border-t border-border bg-surface flex justify-end">
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>Close Window</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
