'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Search, RotateCcw, FileDown } from 'lucide-react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import AddReturnModal from '@/components/AddReturnModal';

export default function ReturnsPage() {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReturns = async (search = '') => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/returns${search ? `?search=${search}` : ''}`);
      if (data.success) {
        setReturns(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch returns', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    // Wait for the user to pause typing before firing a request, instead of
    // hitting the API on every keystroke.
    searchDebounceRef.current = setTimeout(() => {
      if (value.length > 2 || value.length === 0) {
        fetchReturns(value);
      }
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Returns Management</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Track and process customer and supplier medicine returns
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => { window.location.href = '/api/returns/export'; }}
            className="rounded-xl font-bold bg-primary/10 hover:bg-primary/20 text-primary shadow-sm flex items-center gap-2 transition-all hover:-translate-y-1"
          >
            <FileDown className="h-4 w-4" /> Export Report
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-background shadow-sm flex items-center gap-2 transition-all hover:-translate-y-1"
          >
            <Plus className="h-4 w-4" /> Add Return
          </Button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by medicine, batch, or reason..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-12 h-12 rounded-[20px] shadow-soft border-border bg-surface font-medium text-foreground focus:ring-4 focus:ring-primary/10 transition-all outline-none"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="rounded-[24px] shadow-soft border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-muted/50 border-b border-border text-muted-foreground font-bold">
              <tr>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Date</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Type</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Medicine Name</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Batch Number</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Expiry Date</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">MRP</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Qty</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Reason</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Processed By</th>
                <th className="px-6 py-4 font-bold text-muted-foreground uppercase text-[11px] tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary mb-4"></div>
                      <p className="font-bold">Loading records...</p>
                    </div>
                  </td>
                </tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <div className="bg-surface-muted p-4 rounded-full mb-3">
                        <RotateCcw className="h-8 w-8 text-muted-foreground/60" />
                      </div>
                      <p className="text-foreground font-bold text-lg">No returns found</p>
                      <p className="text-sm text-muted-foreground mt-1 font-medium">No medicine returns match your current search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                returns.map((ret: any) => (
                  <tr key={ret.id} className="hover:bg-primary/5 transition-colors border-b border-border">
                    <td className="px-6 py-4 font-bold text-muted-foreground">
                      {format(new Date(ret.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-xl shadow-sm ${
                        ret.type === 'CUSTOMER' ? 'bg-primary/20 text-primary border border-primary/20' : 'bg-surface text-muted-foreground border border-border'
                      }`}>
                        {ret.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-foreground">
                      {ret.medicine?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 font-bold text-muted-foreground">
                      {ret.batchNumber || '-'}
                    </td>
                    <td className="px-6 py-4 font-bold text-muted-foreground">
                      {format(new Date(ret.expiryDate), 'MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 font-extrabold text-primary">
                      ₹{Number(ret.mrp).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-extrabold text-foreground">
                      {Number(ret.quantity)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-bold max-w-[150px] truncate" title={ret.reason}>
                      {ret.reason}
                    </td>
                    <td className="px-6 py-4 font-bold text-muted-foreground">
                      {ret.createdBy?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-xl border shadow-sm ${ret.status === 'COMPLETED' ? 'bg-primary/20 text-primary border-primary/20' : 'bg-surface-muted text-muted-foreground border-border'}`}>
                        {ret.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <AddReturnModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onSuccess={() => fetchReturns(searchQuery)} 
        />
      )}
    </div>
  );
}
