'use client';

import { useState } from 'react';
import axios from 'axios';
import { Upload, FileDown, Loader2, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function DataImportSettings() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'error' | 'success', message: string }>({ type: 'idle', message: '' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = e.target.files[0];
      if (!selected.name.endsWith('.csv')) {
        toast.error('Only .csv files are universally supported for bulk ingestion.');
        return;
      }
      setFile(selected);
      setStatus({ type: 'idle', message: '' });
    }
  };

  const generateTemplate = () => {
    // Generates exactly what the user requested, forcing deterministic formats
    const headers = ['Medicine Name', 'Company', 'Batch Number', 'Expiry Date', 'Quantity', 'Purchase Rate', 'MRP', 'Rack Location'];
    const sample =  ['BRAHMI VATI', 'Ayukalp', 'BT001', '2026-12-31', '100', '45.00', '60.00', 'H1'];
    
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(',') + "\n"
        + sample.join(',');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ayurstock_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('No valid file supplied.');
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') return;

        try {
          const res = await axios.post('/api/settings/import-csv', {
            csvData: text
          });

          if (res.data.success) {
            toast.success('System successfully ingested the CSV matrix!');
            setStatus({ type: 'success', message: res.data.data.message });
            setFile(null);
          }
        } catch (err: any) {
          const errMessage = err.response?.data?.message || 'Upload transmission failed';
          setStatus({ type: 'error', message: errMessage });
          toast.error('Validation engine abruptly rejected the payload.');
        } finally {
          setLoading(false);
        }
      };
      
      reader.readAsText(file);
    } catch (err) {
      setStatus({ type: 'error', message: 'FileReader API crashed parsing binary' });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Mass Data Import</h2>
        <p className="text-sm text-gray-500 mt-1">
          Bypass manual entry mechanisms entirely. Drop a strict `.csv` file detailing legacy mappings and let the engine ingest them natively up to 5000 lines.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            
            {/* Left Col - Info & Template */}
            <div className="flex-1 space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" /> Formatting Guidelines
                </h4>
                <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                  <li>Maximum length is capped at <strong>5000 rows</strong> in a single chunk.</li>
                  <li>Columns must exactly match the internal template layout.</li>
                  <li>Dates must strictly adhere to HTML5 <code>YYYY-MM-DD</code> constraints.</li>
                  <li>Validation engine is <strong>atomic</strong> - if one row fails, nothing writes.</li>
                </ul>
                <Button 
                  onClick={generateTemplate}
                  variant="outline" 
                  className="mt-4 bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Download Blueprint Template
                </Button>
              </div>
            </div>

            {/* Right Col - Upload Area */}
            <div className="flex-1 w-full border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-gray-50/50 relative">
              <input 
                type="file" 
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={loading}
              />
              
              <div className="h-16 w-16 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center mb-4 text-emerald-600">
                <Upload className="h-8 w-8" />
              </div>
              
              <h3 className="font-bold text-gray-900 mb-1">
                {file ? file.name : 'Click or Drag CSV here'}
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                {file ? `${(file.size / 1024).toFixed(2)} KB detected` : 'Valid files: .csv payloads only.'}
              </p>

              <Button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                disabled={!file || loading}
                className="bg-gray-900 text-white w-full max-w-[200px] z-10"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {loading ? 'Ingesting Payload...' : 'Execute Import Engine'}
              </Button>
            </div>

          </div>

          {/* Feedback Section */}
          {status.type !== 'idle' && (
            <div className={`mt-6 p-4 rounded-lg flex items-start gap-3 border ${
              status.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              {status.type === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
              <div>
                <h4 className="font-semibold">{status.type === 'error' ? 'Engine Rejection Alert' : 'Write Successful'}</h4>
                <p className="text-sm mt-1">{status.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
