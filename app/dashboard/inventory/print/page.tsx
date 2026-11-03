'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { Package, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InventoryBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  stockQty: number;
  mrp: number;
  purchaseRate: number | null;
  sellingRate: number;
  rackLocation?: string | null;
  packing?: string;
  medicine: {
    id: string;
    name: string;
    company: string;
    category: string;
    barcode?: string;
    hsn: string;
  };
}

function daysUntilExpiry(expiryDate: string): number {
  return Math.ceil(
    (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

export default function PrintInventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Company name; 'all' or empty means every company.
  const company = searchParams.get('company') || 'all';
  
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInventory();
  }, [company]);

  useEffect(() => {
    axios
      .get('/api/companies')
      .then((res) => {
        if (res.data.success) setCompanies(res.data.data.map((c: { name: string }) => c.name));
      })
      .catch(() => setCompanies([]));
  }, []);

  const handleCompanyChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('companyName');
    if (value === 'all') params.delete('company');
    else params.set('company', value);
    const query = params.toString();
    router.replace(`/dashboard/inventory/print${query ? `?${query}` : ''}`);
  };

  const loadInventory = async () => {
    try {
      setLoading(true);

      const pageSize = 5000;
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      const allBatches: InventoryBatch[] = [];

      while (offset < total) {
        const params: Record<string, string | number> = {
          limit: pageSize,
          offset,
        };

        if (company && company !== 'all') {
          params.company = company;
        }

        const response = await axios.get('/api/inventory/batches', { params });

        if (!response.data.success) {
          throw new Error('Failed to load inventory data');
        }

        const pageBatches: InventoryBatch[] = response.data.data.batches || [];
        allBatches.push(...pageBatches);
        total = Number(response.data.data.total || pageBatches.length);

        if (pageBatches.length === 0) {
          break;
        }

        offset += pageSize;
      }

      setBatches(allBatches);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setError('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading inventory...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const totalValue = batches.reduce((sum, b) => sum + (b.stockQty * Number(b.mrp)), 0);

  return (
    <>
      {/* Company filter + print button - hidden when printing */}
      <div id="inventory-print-btn" className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <select
          value={company}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by company"
        >
          <option value="all">All Companies</option>
          {companies.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <Button onClick={handlePrint} className="gap-2 shadow-lg">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Report content - this is what prints */}
      <div id="inventory-report" className="max-w-[1200px] mx-auto p-8 bg-white">
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Inventory Report</h1>
          <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
            <div>
              <p className="font-medium">
                {company !== 'all' ? `Company: ${company}` : 'All Companies'}
              </p>
              <p>Total Batches: {batches.length}</p>
            </div>
            <div className="text-right">
              <p>Date: {new Date().toLocaleDateString('en-IN', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}</p>
              <p>Total Inventory Value: ₹{totalValue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Table */}
        {batches.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Package className="mx-auto h-16 w-16 mb-4 opacity-30" />
            <p className="font-medium">No inventory batches found</p>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2 px-2 font-bold text-gray-900">Medicine</th>
                <th className="text-left py-2 px-2 font-bold text-gray-900">Company</th>
                <th className="text-left py-2 px-2 font-bold text-gray-900">Category</th>
                <th className="text-left py-2 px-2 font-bold text-gray-900">Batch</th>
                <th className="text-left py-2 px-2 font-bold text-gray-900">Expiry</th>
                <th className="text-right py-2 px-2 font-bold text-gray-900">Stock</th>
                <th className="text-right py-2 px-2 font-bold text-gray-900">MRP</th>
                <th className="text-right py-2 px-2 font-bold text-gray-900">Value</th>
                <th className="text-left py-2 px-2 font-bold text-gray-900">Packing</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const days = daysUntilExpiry(batch.expiryDate);
                const rowValue = batch.stockQty * Number(batch.mrp);
                const isExpired = days < 0;
                const isExpiringSoon = days >= 0 && days <= 30;
                
                return (
                  <tr 
                    key={batch.id}
                    className={`border-b border-gray-300 ${
                      isExpired ? 'bg-red-50' : isExpiringSoon ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td className="py-2 px-2 font-medium text-gray-900">{batch.medicine.name}</td>
                    <td className="py-2 px-2 text-gray-700">{batch.medicine.company}</td>
                    <td className="py-2 px-2 text-gray-600">{batch.medicine.category}</td>
                    <td className="py-2 px-2 font-mono text-gray-700">{batch.batchNumber}</td>
                    <td className="py-2 px-2">
                      <div className="text-gray-700">
                        {new Date(batch.expiryDate).toLocaleDateString('en-IN', { 
                          day: '2-digit', 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </div>
                      {isExpired && (
                        <div className="text-[9px] text-red-600 font-bold">EXPIRED</div>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <div className="text-[9px] text-amber-600 font-bold">{days}d left</div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">{batch.stockQty}</td>
                    <td className="py-2 px-2 text-right text-gray-700">₹{Number(batch.mrp).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-medium text-gray-900">₹{rowValue.toFixed(2)}</td>
                    <td className="py-2 px-2 text-gray-600">{batch.packing || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
          <p>Generated on {new Date().toLocaleString('en-IN')}</p>
          <p className="mt-1">AyurStock Pro - Inventory Management System</p>
        </div>
      </div>

      {/* Self-contained print styles scoped to this page only */}
      <style jsx global>{`
        @media print {
          /* ── Page setup ── */
          @page {
            size: A4 landscape;
            margin: 1cm;
          }

          /* ── Step 1: hide everything on the page ── */
          body * {
            visibility: hidden !important;
          }

          /* ── Step 2: show only the report and all its children ── */
          #inventory-report,
          #inventory-report * {
            visibility: visible !important;
          }

          /* ── Step 3: position report at top-left so it fills the page ── */
          #inventory-report {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          /* ── Colour accuracy ── */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── Multi-page table support ── */
          table  { page-break-inside: auto; }
          tr     { page-break-inside: avoid; page-break-after: auto; }
          thead  { display: table-header-group; }
        }
      `}</style>
    </>
  );
}
