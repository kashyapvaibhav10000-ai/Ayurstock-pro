'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Search, User, Phone, MapPin, Building2, UserCheck, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstin?: string;
  isWholesale: boolean;
  createdAt: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isWholesaleFilter, setIsWholesaleFilter] = useState<boolean | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    isWholesale: false,
  });

  useEffect(() => {
    if (!isAuthorized) router.replace('/dashboard');
  }, [isAuthorized, router]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/customers');
      if (res.data.success) setCustomers(res.data.data);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized]);

  const handleAdd = async () => {
    try {
      const res = await axios.post('/api/customers', newCustomer);
      if (res.data.success) {
        toast.success('Customer added successfully');
        setIsAddModalOpen(false);
        setNewCustomer({ name: '', phone: '', address: '', gstin: '', isWholesale: false });
        await load();
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to add customer');
    }
  };

  const toggleWholesale = async (customer: Customer) => {
    try {
      const res = await axios.patch('/api/customers', { 
        id: customer.id, 
        isWholesale: !customer.isWholesale 
      });
      if (res.data.success) {
        toast.success(`${customer.name} updated successfully`);
        await load();
      }
    } catch {
      toast.error('Failed to update customer status');
    }
  };

  const filtered = customers.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.phone.includes(search);
    
    if (isWholesaleFilter === null) return matchesSearch;
    return matchesSearch && c.isWholesale === isWholesaleFilter;
  });

  if (!isAuthorized) return null;

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Customer Management</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Manage your retail and wholesale customer database.
          </p>
        </div>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-background gap-2 shadow-soft">
              <Plus className="h-5 w-5" /> Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[24px] border-border bg-surface w-[95%] max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-foreground">New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name</Label>
                <Input 
                  placeholder="e.g. Rahul Sharma" 
                  className="rounded-xl border-border bg-background h-11"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number</Label>
                <Input 
                  placeholder="e.g. 9876543210" 
                  className="rounded-xl border-border bg-background h-11"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Address</Label>
                <Input 
                  placeholder="e.g. Sector 12, Dwarka" 
                  className="rounded-xl border-border bg-background h-11"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GSTIN (optional)</Label>
                <Input 
                  placeholder="e.g. 09AAWPK7673B1ZP" 
                  className="rounded-xl border-border bg-background h-11 font-mono uppercase"
                  value={newCustomer.gstin}
                  onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-surface-muted/30 mt-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div>
                    <Label className="text-sm font-bold block">Wholesale Client</Label>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Enable specialized pricing for transfers</p>
                  </div>
                </div>
                <Switch 
                  checked={newCustomer.isWholesale}
                  onCheckedChange={(checked) => setNewCustomer({ ...newCustomer, isWholesale: checked })}
                />
              </div>
              <Button size="lg" className="w-full rounded-xl font-black tracking-widest uppercase mt-4 bg-primary text-background" onClick={handleAdd}>
                Create Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[24px] border-border bg-surface shadow-soft md:col-span-1">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg font-black flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Filters</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="Search name or phone..." 
                className="pl-9 rounded-xl border-border bg-background h-11 text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 pl-1">Client Type</Label>
              <div className="grid grid-cols-1 gap-2">
                <Button 
                  variant={isWholesaleFilter === null ? 'default' : 'outline'} 
                  className={`justify-start gap-2 rounded-xl h-10 font-bold transition-all ${isWholesaleFilter === null ? 'shadow-soft' : 'border-border text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}
                  onClick={() => setIsWholesaleFilter(null)}
                >
                  <User className="h-4 w-4" /> All Customers
                </Button>
                <Button 
                  variant={isWholesaleFilter === false ? 'default' : 'outline'} 
                  className={`justify-start gap-2 rounded-xl h-10 font-bold transition-all ${isWholesaleFilter === false ? 'shadow-soft' : 'border-border text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}
                  onClick={() => setIsWholesaleFilter(false)}
                >
                  <UserCheck className="h-4 w-4" /> Retail Only
                </Button>
                <Button 
                  variant={isWholesaleFilter === true ? 'default' : 'outline'} 
                  className={`justify-start gap-2 rounded-xl h-10 font-bold transition-all ${isWholesaleFilter === true ? 'shadow-soft' : 'border-border text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}
                  onClick={() => setIsWholesaleFilter(true)}
                >
                  <Building2 className="h-4 w-4" /> Wholesale / Transfer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-border bg-surface shadow-soft md:col-span-2 overflow-hidden">
          <CardHeader className="border-b border-border bg-surface-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-black">Customer List</CardTitle>
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                {filtered.length} Total
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-20 text-center text-sm font-bold text-muted-foreground animate-pulse">Scanning records...</div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-sm font-bold text-muted-foreground">No customers found matching filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-muted/50 border-b border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider py-4">Customer</TableHead>
                      <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider py-4">Contact Info</TableHead>
                      <TableHead className="font-bold text-muted-foreground uppercase text-[11px] tracking-wider py-4 text-center">Wholesale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((customer) => (
                      <TableRow key={customer.id} className="hover:bg-primary/5 transition-colors border-b border-border group">
                        <TableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center text-sm font-bold tracking-tight shadow-soft transition-all duration-300 group-hover:scale-110 ${
                              customer.isWholesale ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-surface-muted/80 text-muted-foreground border border-border/50'
                            }`}>
                              {customer.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-foreground truncate">{customer.name}</p>
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-0.5">Joined {new Date(customer.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                              <Phone className="h-3 w-3 text-primary/60" /> {customer.phone}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground/80 lowercase">
                              <MapPin className="h-3 w-3 text-primary/60" /> {customer.address}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-center">
                          <Switch 
                            checked={customer.isWholesale}
                            onCheckedChange={() => toggleWholesale(customer)}
                            className="mx-auto"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
