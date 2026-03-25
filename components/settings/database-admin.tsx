'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Database, Download, Trash2, AlertTriangle, Loader2, RefreshCw, Search,
  FileText, Package, ShoppingCart, Truck, Users, Building, ChevronDown,
  Upload, ShieldCheck, CheckCircle2, XCircle, HardDrive, RotateCcw
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type CompanyEntry = { name: string; count: number };
type DryRunSummary = {
  medicines: number; inventoryBatches: number; suppliers: number;
  companies: number; rackLocations: number; customers: number; message: string;
};

export default function DatabaseAdmin() {
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loadingMedicines, setLoadingMedicines] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Delete by company state
  const [companies, setCompanies] = useState<CompanyEntry[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyEntry | null>(null);
  const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  // Backup & Restore state
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [dryRunSummary, setDryRunSummary] = useState<DryRunSummary | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreResult, setRestoreResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const response = await axios.get('/api/medicines/companies');
      if (response.data.success) setCompanies(response.data.companies);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
      toast.error('Failed to load company list');
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleDeleteByCompany = async () => {
    if (!selectedCompany || confirmText !== selectedCompany.name) return;
    setIsDeletingCompany(true);
    try {
      const response = await axios.delete('/api/medicines/by-company', {
        data: { companyName: selectedCompany.name },
      });
      if (response.data.success) {
        toast.success(`Deleted ${response.data.deletedCount} medicines from ${selectedCompany.name}`);
        setIsCompanyDialogOpen(false);
        setSelectedCompany(null);
        setConfirmText('');
        fetchStats(); fetchCompanies(); fetchMedicines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete medicines');
    } finally {
      setIsDeletingCompany(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const response = await axios.get('/api/admin/db-stats');
      if (response.data.success) setStats(response.data.counts);
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
      const response = await axios.get(`/api/medicines/search?query=${searchQuery}&limit=10`);
      if (response.data.success) setMedicines(response.data.data);
    } catch (error) {
      console.error('Failed to fetch medicines:', error);
    } finally {
      setLoadingMedicines(false);
    }
  };

  useEffect(() => { fetchStats(); fetchMedicines(); fetchCompanies(); }, []);

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const response = await axios.delete('/api/medicines/clear-all');
      if (response.data.success) {
        toast.success("Database cleared successfully");
        setIsDialogOpen(false);
        fetchStats(); fetchMedicines();
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

  // --- Backup Handlers ---
  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const response = await axios.get('/api/database/backup', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `AyurStock_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Backup downloaded successfully!");
    } catch (error) {
      toast.error("Failed to generate backup");
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a valid AyurStock .json backup file');
      return;
    }
    setRestoreFile(file);
    setDryRunSummary(null);
    setRestoreResult(null);
    setShowRestoreConfirm(false);
    setRestoreConfirmText('');
  };

  const handleDryRun = async () => {
    if (!restoreFile) return;
    setIsDryRunning(true);
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);
      const response = await axios.post('/api/database/restore?dryRun=true', backup);
      if (response.data.success) {
        setDryRunSummary(response.data.summary);
        toast.success("Validation complete! Review the summary below.");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invalid backup file. Cannot validate.');
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || restoreConfirmText !== 'RESTORE') return;
    setIsRestoring(true);
    setShowRestoreConfirm(false);
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);
      const response = await axios.post('/api/database/restore', backup);
      if (response.data.success) {
        setRestoreResult(response.data);
        toast.success(response.data.message);
        fetchStats(); fetchMedicines();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Restore failed. Please try again.');
    } finally {
      setIsRestoring(false);
      setRestoreConfirmText('');
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
            {loadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : (count || 0).toLocaleString()}
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
        <StatCard title="Medicines" count={stats?.medicines} icon={Package} color="bg-blue-50 text-blue-600" />
        <StatCard title="Inventory Batches" count={stats?.inventoryBatches} icon={Database} color="bg-emerald-50 text-emerald-600" />
        <StatCard title="Sales" count={stats?.sales} icon={ShoppingCart} color="bg-purple-50 text-purple-600" />
        <StatCard title="Purchases" count={stats?.purchases} icon={Truck} color="bg-orange-50 text-orange-600" />
        <StatCard title="Suppliers" count={stats?.suppliers} icon={Building} color="bg-indigo-50 text-indigo-600" />
        <StatCard title="Customers" count={stats?.customers} icon={Users} color="bg-pink-50 text-pink-600" />
      </div>

      {/* ===================== BACKUP & RESTORE SECTION ===================== */}
      <div>
        <h3 className="text-base font-bold text-stitch-onSurface mb-3 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-stitch-primary" />
          Backup & Restore
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Download Backup */}
          <Card className="border-stitch-surfaceLow bg-stitch-surfaceLowest shadow-sm">
            <CardHeader className="pb-3 border-b border-stitch-surfaceLow">
              <CardTitle className="text-sm font-bold text-stitch-onSurface flex items-center gap-2">
                <Download className="h-4 w-4 text-stitch-primary" />
                Download Full Backup
              </CardTitle>
              <CardDescription className="text-xs text-stitch-onSurfaceVariant">
                Downloads a complete snapshot of your medicines, inventory, suppliers & rack locations as a <code>.json</code> file. Sales history is NOT included (safe).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <Button
                onClick={handleDownloadBackup}
                disabled={isDownloadingBackup}
                className="w-full gap-2 bg-stitch-primary hover:bg-stitch-primary/90 text-white font-bold"
              >
                {isDownloadingBackup
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  : <><Download className="h-4 w-4" /> Download AyurStock Backup</>
                }
              </Button>
            </CardContent>
          </Card>

          {/* Restore from Backup */}
          <Card className="border-amber-200 bg-amber-50/30 shadow-sm">
            <CardHeader className="pb-3 border-b border-amber-200">
              <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <Upload className="h-4 w-4 text-amber-600" />
                Restore from Backup
              </CardTitle>
              <CardDescription className="text-xs text-amber-700/80">
                Upload a previously downloaded backup file. Uses safe UPSERT — sales records are never touched.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100 transition-colors p-6 text-center"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <HardDrive className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                {restoreFile
                  ? <p className="text-sm font-bold text-amber-800">{restoreFile.name}</p>
                  : <p className="text-sm text-amber-600 font-medium">Click to select <code>.json</code> backup file</p>
                }
              </div>

              {/* Dry Run */}
              {restoreFile && !dryRunSummary && (
                <Button
                  onClick={handleDryRun}
                  disabled={isDryRunning}
                  variant="outline"
                  className="w-full gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  {isDryRunning
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Validating...</>
                    : <><ShieldCheck className="h-4 w-4" /> Validate File (Dry Run)</>
                  }
                </Button>
              )}

              {/* Dry-Run Summary */}
              {dryRunSummary && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <p className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" /> Validation Complete
                  </p>
                  <p className="text-sm text-blue-700">{dryRunSummary.message}</p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: 'Medicines', val: dryRunSummary.medicines },
                      { label: 'Batches', val: dryRunSummary.inventoryBatches },
                      { label: 'Suppliers', val: dryRunSummary.suppliers },
                    ].map(({ label, val }) => (
                      <div key={label} className="rounded-lg bg-white border border-blue-100 text-center p-2">
                        <p className="text-lg font-extrabold text-blue-800">{val}</p>
                        <p className="text-[10px] text-blue-500 font-semibold uppercase">{label}</p>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => setShowRestoreConfirm(true)}
                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold mt-1"
                  >
                    <RotateCcw className="h-4 w-4" /> Proceed with Restore
                  </Button>
                </div>
              )}

              {/* Restore Result */}
              {restoreResult && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" /> Restore Complete!
                  </p>
                  <p className="text-xs text-green-700 mt-1">{restoreResult.message}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===================== RED ZONE RESTORE CONFIRM DIALOG ===================== */}
      <Dialog open={showRestoreConfirm} onOpenChange={(o) => { setShowRestoreConfirm(o); if (!o) setRestoreConfirmText(''); }}>
        <DialogContent className="max-w-md border-red-200 bg-red-50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 text-lg">
              <AlertTriangle className="h-6 w-6" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription className="pt-2 text-red-800">
              <strong>This will overwrite your current medicines, suppliers, and rack locations</strong> using UPSERT. Your sales history and financial records will NOT be changed.
              <br /><br />
              An automatic backup of your current data will be saved to your Activity Log before the restore begins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <p className="text-sm text-red-700 font-medium">
              Type <span className="font-mono font-extrabold bg-red-100 px-1.5 py-0.5 rounded text-red-900">RESTORE</span> to confirm:
            </p>
            <Input
              placeholder="Type RESTORE here..."
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              className="font-mono border-red-300 focus:ring-red-400 bg-white"
            />
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowRestoreConfirm(false)} disabled={isRestoring}>
              Cancel
            </Button>
            <Button
              onClick={handleRestore}
              disabled={isRestoring || restoreConfirmText !== 'RESTORE'}
              className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
            >
              {isRestoring
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Restoring...</>
                : <><RotateCcw className="h-4 w-4" /> Yes, Restore Database</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== EXISTING ACTIONS ===================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 text-slate-900 bg-slate-50 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Export Medicines as CSV
            </CardTitle>
            <CardDescription className="text-slate-500">
              Download your master medicine list for external analysis or printing.
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
                  <Button variant="destructive" onClick={handleClearAll} disabled={isDeleting} className="gap-2 font-bold">
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Confirm Absolute Wipeout
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Delete Medicines by Company */}
      <Card className="border-orange-200 shadow-sm bg-orange-50/30">
        <CardHeader className="pb-3 bg-orange-50/60 border-b border-orange-200">
          <CardTitle className="text-base font-bold text-orange-900 flex items-center gap-2">
            <Building className="h-4 w-4" />
            Delete Medicines by Company
          </CardTitle>
          <CardDescription className="text-orange-700/80">
            Permanently remove all medicines belonging to a specific company.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="relative">
            <select
              className="w-full appearance-none rounded-lg border border-orange-200 bg-white px-4 py-2.5 pr-10 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
              value={selectedCompany?.name ?? ''}
              onChange={(e) => {
                const found = companies.find((c) => c.name === e.target.value) ?? null;
                setSelectedCompany(found);
                setConfirmText('');
              }}
              disabled={loadingCompanies}
            >
              <option value="">
                {loadingCompanies ? 'Loading companies…' : `— Select a company (${companies.length} found) —`}
              </option>
              {companies.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count} medicine{c.count !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
          </div>

          {selectedCompany && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800 font-medium">
                This will permanently delete all{' '}
                <span className="font-bold">{selectedCompany.count}</span> medicines from{' '}
                <span className="font-bold">{selectedCompany.name}</span>. This cannot be undone.
              </p>
            </div>
          )}

          <Dialog
            open={isCompanyDialogOpen}
            onOpenChange={(open) => {
              setIsCompanyDialogOpen(open);
              if (!open) setConfirmText('');
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full gap-2 font-bold"
                disabled={!selectedCompany}
              >
                <Trash2 className="h-4 w-4" />
                Delete All {selectedCompany ? `"${selectedCompany.name}"` : 'Company'} Medicines
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  Confirm Deletion
                </DialogTitle>
                <DialogDescription className="pt-2 text-slate-700">
                  You are about to permanently delete{' '}
                  <span className="font-bold text-slate-900">{selectedCompany?.count ?? 0} medicines</span> from{' '}
                  <span className="font-bold text-slate-900">{selectedCompany?.name}</span>.
                  <br />
                  <span className="text-red-600 font-semibold text-xs uppercase mt-1 block">This cannot be undone.</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 mt-2">
                <p className="text-sm text-slate-600">
                  Type{' '}
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                    {selectedCompany?.name}
                  </span>{' '}
                  to confirm:
                </p>
                <Input
                  placeholder="Type company name here…"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="font-mono"
                />
              </div>
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => { setIsCompanyDialogOpen(false); setConfirmText(''); }}
                  disabled={isDeletingCompany}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteByCompany}
                  disabled={isDeletingCompany || confirmText !== selectedCompany?.name}
                  className="gap-2 font-bold"
                >
                  {isDeletingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete {selectedCompany?.count ?? 0} Medicines
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Raw Preview Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Raw Medicine Data (Last 10 Records)
            </CardTitle>
            <CardDescription>Quick verification of underlying database structure.</CardDescription>
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
                      <TableCell className="font-mono text-[10px] text-slate-400 truncate max-w-[80px]">{med.id}</TableCell>
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
