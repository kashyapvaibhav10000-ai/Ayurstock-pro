'use client';

import { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import { Package, Clock, BarChart2, Loader2 } from 'lucide-react';
import axios from 'axios';

type Settings = {
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  autoFEFOBilling: boolean;
  lowStockThreshold: number;
  nearExpiryDays: number;
};

function ColorSlider({
  label, value, onChange, min, max, unit,
  greenThreshold, yellowThreshold,
  icon: Icon, description
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; unit: string;
  greenThreshold: number; yellowThreshold: number;
  icon: any; description: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const color = value <= greenThreshold ? '#22c55e' : value <= yellowThreshold ? '#f59e0b' : '#ef4444';
  const textColor = value <= greenThreshold ? 'text-green-600' : value <= yellowThreshold ? 'text-amber-600' : 'text-red-600';
  const bgColor = value <= greenThreshold ? 'bg-green-50 border-green-200' : value <= yellowThreshold ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const statusLabel = value <= greenThreshold ? '🟢 Comfortable' : value <= yellowThreshold ? '🟡 Moderate' : '🔴 Alert Zone';

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <div>
            <p className="text-sm font-bold text-slate-800">{label}</p>
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-extrabold ${textColor}`}>{value}</p>
          <p className="text-[10px] text-slate-400">{unit}</p>
        </div>
      </div>

      {/* Color-coded slider */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">{min} {unit}</span>
        <span className={`text-[10px] font-semibold ${textColor}`}>{statusLabel}</span>
        <span className="text-[10px] text-slate-400">{max} {unit}</span>
      </div>
    </div>
  );
}

export default function InventorySettings() {
  const [settings, setSettings] = useState<Settings>({
    enableBatchTracking: true,
    enableExpiryTracking: true,
    autoFEFOBilling: true,
    lowStockThreshold: 5,
    nearExpiryDays: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings/inventory');
        if (res.data.success) {
          setSettings(res.data.data);
        }
      } catch (error) {
        console.error('Failed to load inventory settings', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleToggle = (key: keyof Settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.patch('/api/settings/inventory', settings);
      if (res.data.success) {
        setSettings(res.data.data);
        toast.success('Inventory settings saved!');
      } else {
        throw new Error(res.data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Failed to save inventory settings', error);
      toast.error('Failed to save inventory settings');
    } finally {
      setSaving(false);
    }
  };

  const ToggleRow = ({ label, description, settingKey }: { label: string; description: string; settingKey: keyof Settings }) => (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
      </div>
      <Switch
        checked={settings[settingKey] as boolean}
        onCheckedChange={() => handleToggle(settingKey)}
        disabled={loading}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-stitch-primary" />
          Inventory Settings
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure tracking rules and visual alert thresholds for your stock.
        </p>
      </div>

      {/* Toggle Switches */}
      <div className="space-y-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tracking Rules</p>
        <ToggleRow
          label="Batch Tracking"
          description="Track individual medicine batches for precise stock management"
          settingKey="enableBatchTracking"
        />
        <ToggleRow
          label="Expiry Tracking"
          description="Get alerts when medicines are approaching their expiry date"
          settingKey="enableExpiryTracking"
        />
        <ToggleRow
          label="Auto FEFO Billing"
          description="First Expiry First Out — automatically sell the nearest-expiry batch"
          settingKey="autoFEFOBilling"
        />
      </div>

      {/* Color-Coded Sliders */}
      <div className="space-y-3">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Alert Thresholds</p>

        <ColorSlider
          label="Low Stock Alert"
          description="Warn me when strips fall below this number"
          value={settings.lowStockThreshold}
          onChange={(v) => setSettings((prev) => ({ ...prev, lowStockThreshold: v }))}
          min={1}
          max={50}
          unit="strips"
          greenThreshold={10}
          yellowThreshold={25}
          icon={Package}
        />

        <ColorSlider
          label="Near Expiry Alert"
          description="Warn me when a batch expires within this window"
          value={settings.nearExpiryDays}
          onChange={(v) => setSettings((prev) => ({ ...prev, nearExpiryDays: v }))}
          min={7}
          max={180}
          unit="days"
          greenThreshold={60}
          yellowThreshold={120}
          icon={Clock}
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={loading || saving}
        className="w-full bg-stitch-primary hover:bg-stitch-primary/90 text-white font-bold"
      >
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Save Inventory Settings'}
      </Button>
    </div>
  );
}
