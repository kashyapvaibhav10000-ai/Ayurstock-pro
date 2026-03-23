'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Database, 
  Download, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  RefreshCw,
  Search,
  FileText,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Building
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export default function DatabaseAdmin() {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const response = await axios.get('/api/admin/db-stats');
      if (response.data.success) {
        setStats(response.data.counts);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to load database statistics');
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchMedicines = async () => {
    setLoadingMedicines(true);
    try {
      // Use existing search API to preview raw data
      const response = await axios.get(`/api/medicines/search?query=${searchQuery}&limit=10`);
      if (response.data.success) {
        setMedicines(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch medicines:', error);
    } finally {
      setLoadingMedicines(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchMedicines();
  }, []);

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const response = await axios.delete('/api/medicines/clear-all');
      if (response.data.success) {
        toast.success("Database cleared successfully");
        setIsDialogOpen(false);
        fetchStats();
        fetchMedicines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to clear data");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await axios.get('/api/medicines/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `medicines_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Export started");
    } catch (error) {
      toast.error("Failed to export medicines");
    } finally {
      setExporting(false);
    }
  };

  const StatCard = ({ title, count, icon: Icon, color }: any) => (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-xl font-bold text-slate-900">
            {loadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : count.toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Database Administration
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Monitor records and perform bulk operations on your shop data.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loadingStats} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} />
          Refresh Stats
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Medicines" 
          count={stats?.medicines || 0} 
          icon={Package} 
          color="bg-blue-50 text-blue-600" 
        />
        <StatCard 
          title="Inventory Batches" 
          count={stats?.inventoryBatches || 0} 
          icon={Database} 
          color="bg-emerald-50 text-emerald-600" 
        />
        <StatCard 
          title="Sales" 
          count={stats?.sales || 0} 
          icon={ShoppingCart} 
          color="bg-purple-50 text-purple-600" 
        />
        <StatCard 
          title="Purchases" 
          count={stats?.purchases || 0} 
          icon={Truck} 
          color="bg-orange-50 text-orange-600" 
        />
        <StatCard 
          title="Suppliers" 
          count={stats?.suppliers || 0} 
          icon={Building} 
          color="bg-indigo-50 text-indigo-600" 
        />
        <StatCard 
          title="Customers" 
          count={stats?.customers || 0} 
          icon={Users} 
          color="bg-pink-50 text-pink-600" 
        />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 text-slate-900 bg-slate-50 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Data Export
            </CardTitle>
            <CardDescription className="text-slate-500">
              Download your master medicine list for backup or external analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Button 
              onClick={handleExport} 
              disabled={exporting || loadingStats || (stats?.medicines === 0)}
              className="w-full gap-2 bg-slate-800 hover:bg-slate-950 text-white font-medium"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Medicines as CSV
            </Button>
          </CardContent>
        </Card>

        <Card className="border-danger/20 shadow-sm bg-danger-bg/10">
          <CardHeader className="pb-3 bg-danger-bg/20 border-b border-danger/20">
            <CardTitle className="text-base font-bold text-danger-text flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-danger-text/80">
              Permanently wipe all medicinal and transactional data for this shop.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full gap-2 font-bold shadow-sm">
                  <Trash2 className="h-4 w-4" />
                  Clear All Database Records
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-danger-text">
                    <AlertTriangle className="h-5 w-5" />
                    Destructive Action
                  </DialogTitle>
                  <DialogDescription className="pt-2 text-slate-700 font-medium">
                    You are about to permanently delete everything. 
                    This will wipe:
                    <ul className="list-disc list-inside mt-2 space-y-1 text-slate-900">
                      <li>Total {stats?.medicines || 0} Medicines</li>
                      <li>Total {stats?.inventoryBatches || 0} Inventory Batches</li>
                      <li>Total {stats?.sales || 0} Sales Records</li>
                    </ul>
                    <p className="mt-4 text-red-600 font-bold uppercase text-xs">This cannot be undone!</p>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isDeleting}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleClearAll} 
                    disabled={isDeleting}
                    className="gap-2 font-bold"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Confirm Absolute Wipeout
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Raw Preview Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Raw Medicine Data (Last 10 Records)
            </CardTitle>
            <CardDescription>
              Quick verification of underlying database structure.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
             <div className="relative">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
               <Input 
                 placeholder="Search raw..."
                 className="pl-9 h-9 w-44 lg:w-64"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && fetchMedicines()}
               />
             </div>
             <Button size="sm" variant="ghost" onClick={fetchMedicines} disabled={loadingMedicines}>
                <RefreshCw className={`h-4 w-4 ${loadingMedicines ? 'animate-spin' : ''}`} />
             </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold">ID</TableHead>
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold">Company</TableHead>
                  <TableHead className="font-bold">Category</TableHead>
                  <TableHead className="font-bold">Barcode</TableHead>
                  <TableHead className="font-bold text-right">Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMedicines ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" />
                    </TableCell>
                  </TableRow>
                ) : medicines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                      No matching records found in database.
                    </TableCell>
                  </TableRow>
                ) : (
                  medicines.map((med) => (
                    <TableRow key={med.id}>
                      <TableCell className="font-mono text-[10px] text-slate-400 truncate max-w-[80px]">
                        {med.id}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{med.name}</TableCell>
                      <TableCell className="text-slate-600">{med.company}</TableCell>
                      <TableCell>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase">
                          {med.category}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{med.barcode || '-'}</TableCell>
                      <TableCell className="text-right text-xs text-slate-500">
                        {new Date(med.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
