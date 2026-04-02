'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, ReceiptText, CheckCircle2 } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const DEFAULT_CATEGORIES = [
  'Churna', 'Powder', 'Syrup', 'Tablet', 'Capsule', 'Vati',
  'Oil', 'Cream', 'Gel', 'Drops', 'Bhasma', 'Asav', 'Chawanprash',
];

type CategoryGst = {
  category: string;
  gstPercent: number;
};

export default function GstCategorySettings() {
  const [categories, setCategories] = useState<CategoryGst[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/settings/gst-categories');
      if (response.data.success) {
        const saved = response.data.data as { category: string; gstPercent: number }[];
        const savedMap = new Map(saved.map(s => [s.category, s.gstPercent]));

        // Merge saved values with defaults
        const merged = DEFAULT_CATEGORIES.map(cat => ({
          category: cat,
          gstPercent: savedMap.get(cat) ?? 0,
        }));

        // Add any custom categories from DB that aren't in defaults
        for (const s of saved) {
          if (!DEFAULT_CATEGORIES.includes(s.category)) {
            merged.push({ category: s.category, gstPercent: s.gstPercent });
          }
        }

        setCategories(merged);
      }
    } catch (error) {
      console.error('Failed to fetch GST categories:', error);
      // Fallback to defaults
      setCategories(DEFAULT_CATEGORIES.map(cat => ({ category: cat, gstPercent: 0 })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const updateGst = (index: number, value: string) => {
    const num = parseInt(value) || 0;
    setCategories(prev => {
      const next = [...prev];
      next[index] = { ...next[index], gstPercent: Math.max(0, Math.min(28, num)) };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put('/api/settings/gst-categories', { categories });
      if (response.data.success) {
        toast.success(response.data.message || 'GST defaults saved successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save GST defaults');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <ReceiptText className="h-5 w-5 text-primary" />
            </div>
            GST by Category
          </h2>
          <p className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-widest leading-relaxed">
            Set default GST% per Ayurvedic medicine category. These defaults auto-fill when adding new inventory.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="gap-2 font-bold bg-primary hover:bg-primary/90 text-white"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Defaults
        </Button>
      </div>

      <Card className="border-border bg-surface shadow-soft">
        <CardHeader className="pb-4 border-b border-border">
          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Category → GST Rate Mapping
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground mt-1">
            Common GST rates for Ayurvedic medicines: 0%, 5%, 12%, 18%. Set the appropriate rate for each category.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((cat, i) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between px-6 py-3 hover:bg-primary/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary text-[10px] font-black">
                      {i + 1}
                    </span>
                    <span className="font-bold text-[13px] text-foreground tracking-wide">
                      {cat.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={28}
                      value={cat.gstPercent}
                      onChange={(e) => updateGst(i, e.target.value)}
                      className="w-20 h-8 text-center font-bold text-[13px] rounded-lg border-border"
                    />
                    <span className="text-[11px] font-bold text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] font-medium text-muted-foreground">
          These defaults will auto-populate the GST% field when selecting a medicine category during inventory batch entry.
          Individual batch GST rates can still be overridden manually.
        </p>
      </div>
    </div>
  );
}
