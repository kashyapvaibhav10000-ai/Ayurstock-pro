'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { History, Loader2, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import InventoryHistoryTable, { MedicineBatchSummary } from '@/components/inventory-history/InventoryHistoryTable';
import { batchLabel } from '@/lib/batch';

interface MedicineOption {
  id: string;
  name: string;
  company: string;
}

function MedicinePicker({ value, onChange }: { value: MedicineOption | null; onChange: (m: MedicineOption | null) => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<MedicineOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    let active = true;
    setLoading(true);
    const handle = setTimeout(() => {
      axios
        .get('/api/medicines/search', { params: { q, limit: 15 } })
        .then((res) => {
          if (active) setOptions(res.data.data || []);
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <div>
          <div className="text-sm font-black text-foreground">{value.name}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{value.company}</div>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-danger transition-colors"
          aria-label="Clear medicine"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a medicine to see its full stock history"
        className="h-11 pl-9 rounded-xl"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      {options.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-bento">
          {options.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange(m);
                setQuery('');
                setOptions([]);
              }}
              className="block w-full px-4 py-2.5 text-left hover:bg-surface-muted/60 border-b border-border/50 last:border-0"
            >
              <div className="text-sm font-bold text-foreground">{m.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.company}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InventoryHistoryTab() {
  const [medicine, setMedicine] = useState<MedicineOption | null>(null);
  const [batches, setBatches] = useState<MedicineBatchSummary[]>([]);

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardHeader className="pb-6 border-b border-border">
        <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <History className="h-5 w-5 text-primary" />
          </div>
          Inventory History
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Every stock change, batch by batch. Quantities are in base units; balance is the batch stock right after the change.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs defaultValue="all" className="space-y-6">
          <TabsList className="bg-surface border border-border">
            <TabsTrigger value="all" className="text-xs font-black tracking-widest uppercase">All Movements</TabsTrigger>
            <TabsTrigger value="medicine" className="text-xs font-black tracking-widest uppercase">By Medicine</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="m-0">
            <InventoryHistoryTable />
          </TabsContent>

          <TabsContent value="medicine" className="m-0 space-y-5">
            <MedicinePicker
              value={medicine}
              onChange={(m) => {
                setMedicine(m);
                setBatches([]);
              }}
            />
            {medicine && (
              <>
                {batches.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {batches.map((b) => (
                      <div key={b.id} className="rounded-xl border border-border bg-background px-4 py-3">
                        <div className="font-mono text-xs font-bold text-foreground">{batchLabel(b)}</div>
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {b.deletedAt ? 'Archived' : 'In stock'}
                          </span>
                          <span className="text-lg font-black font-mono text-foreground">{b.stockQty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <InventoryHistoryTable medicineId={medicine.id} onBatchesLoaded={setBatches} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
