'use client';

import { useState, useEffect } from 'react';
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
    setSearchQuery(e.target.value);
    if (e.target.value.length > 2 || e.target.value.length === 0) {
      fetchReturns(e.target.value);
    }
  };

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">Returns Management</h1>
          <p className="mt-1 text-sm font-medium text-text-secondary">
            Track and process customer and supplier medicine returns
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => { window.location.href = '/api/returns/export'; }}
            className="rounded-xl font-bold bg-success-bg/80 hover:bg-success-bg text-success shadow-sm flex items-center gap-2 transition-all hover:-translate-y-1 hover:shadow-bento"
          >
            <FileDown className="h-4 w-4" /> Export Report
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-xl font-bold bg-primary hover:bg-primary-hover text-white shadow-sm flex items-center gap-2 transition-all hover:-translate-y-1 hover:shadow-bento"
          >
            <Plus className="h-4 w-4" /> Add Return
          </Button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
          <Input
            placeholder="Search by medicine, batch, or reason..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-12 h-12 rounded-[20px] shadow-soft border-surface-border bg-surface font-medium text-text-primary focus:ring-4 focus:ring-primary/10 transition-all focus:shadow-bento outline-none"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="rounded-[24px] shadow-soft border border-surface-border bg-surface overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-muted/50 border-b border-surface-border text-text-secondary font-bold">
              <tr>
                <th className="px-6 py-4 font-bold text-text-secondary">Date</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Type</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Medicine Name</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Batch Number</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Expiry Date</th>
                <th className="px-6 py-4 font-bold text-text-secondary">MRP</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Qty</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Reason</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Processed By</th>
                <th className="px-6 py-4 font-bold text-text-secondary">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600 mb-4"></div>
                      <p>Loading records...</p>
                    </div>
                  </td>
                </tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center">
                      <div className="bg-surface-muted p-4 rounded-full mb-3">
                        <RotateCcw className="h-8 w-8 text-text-muted/60" />
                      </div>
                      <p className="text-text-secondary font-semibold">No returns found</p>
                      <p className="text-xs text-text-muted mt-1">No medicine returns match your current search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                returns.map((ret: any) => (
                  <tr key={ret.id} className="hover:bg-surface-muted transition-colors border-b border-surface-border">
                    <td className="px-6 py-4 font-medium text-text-secondary">
                      {format(new Date(ret.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-xl shadow-sm ${
                        ret.type === 'CUSTOMER' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-surface text-text-secondary border border-surface-border'
                      }`}>
                        {ret.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-text-primary">
                      {ret.medicine?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-secondary">
                      {ret.batchNumber || '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-secondary">
                      {format(new Date(ret.expiryDate), 'MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 font-bold text-primary">
                      ₹{ret.mrp.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-extrabold text-text-primary">
                      {ret.quantity}
                    </td>
                    <td className="px-6 py-4 text-text-secondary font-medium max-w-[150px] truncate" title={ret.reason}>
                      {ret.reason}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-secondary">
                      {ret.createdBy?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-xl border shadow-sm ${ret.status === 'COMPLETED' ? 'bg-success-bg/50 text-success-text border-success/20' : 'bg-surface-muted text-text-secondary border-surface-border'}`}>
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
