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
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Returns Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and process customer and supplier medicine returns
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => { window.location.href = '/api/returns/export'; }}
            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 shadow-sm flex items-center gap-2"
          >
            <FileDown className="h-4 w-4" /> Export Report
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Return
          </Button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by medicine, batch, or reason..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-9 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Medicine Name</th>
                <th className="px-6 py-4">Batch Number</th>
                <th className="px-6 py-4">Expiry Date</th>
                <th className="px-6 py-4">MRP</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">Processed By</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                  <td colSpan={10} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center">
                      <div className="bg-gray-50 p-4 rounded-full mb-3">
                        <RotateCcw className="h-8 w-8 text-gray-300" />
                      </div>
                      <p className="text-gray-500 font-medium">No returns found</p>
                      <p className="text-xs text-gray-400 mt-1">No medicine returns match your current search.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                returns.map((ret: any) => (
                  <tr key={ret.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-700">
                      {format(new Date(ret.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-[10px] font-bold tracking-wide uppercase rounded-md ${
                        ret.type === 'CUSTOMER' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-orange-50 text-orange-600 border border-orange-100'
                      }`}>
                        {ret.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-emerald-700">
                      {ret.medicine?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {ret.batchNumber || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {format(new Date(ret.expiryDate), 'MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium">
                      ₹{ret.mrp.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-bold">
                      {ret.quantity}
                    </td>
                    <td className="px-6 py-4 text-gray-500 max-w-[150px] truncate" title={ret.reason}>
                      {ret.reason}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {ret.createdBy?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
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
