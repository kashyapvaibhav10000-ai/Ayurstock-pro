import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function InvoiceSettings() {
  const [formData, setFormData] = useState({
    invoicePrefix: 'INV-',
    watermarkText: '',
    watermarkEnabled: true,
  });
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/settings/invoice');
        if (response.data.success) {
          const settings = response.data.data;
          setFormData({
            invoicePrefix: settings.invoicePrefix || 'INV-',
            watermarkText: settings.watermarkText || '',
            watermarkEnabled: settings.watermarkEnabled ?? true,
          });
          setNextInvoiceNumber(settings.nextInvoiceNumber || 1);
        }
      } catch (error) {
        console.error('Failed to load invoice settings', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const previewInvoiceNumber = useMemo(() => {
    return `${formData.invoicePrefix}${String(nextInvoiceNumber).padStart(3, '0')}`;
  }, [formData.invoicePrefix, nextInvoiceNumber]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put('/api/settings/invoice', formData);
      if (response.data.success) {
        const settings = response.data.data;
        setFormData({
          invoicePrefix: settings.invoicePrefix || 'INV-',
          watermarkText: settings.watermarkText || '',
          watermarkEnabled: settings.watermarkEnabled ?? true,
        });
        setNextInvoiceNumber(settings.nextInvoiceNumber || nextInvoiceNumber);
        toast.success('Invoice settings saved successfully.');
      }
    } catch (error) {
      console.error('Failed to save invoice settings', error);
      toast.error('Failed to save invoice settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Invoice Settings</h2>
          <p className="text-sm text-slate-500">Control invoice numbering and print styling.</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700">
          Shop name, address, GSTIN, and contact details now come from Shop Settings.
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Invoice Prefix"
            name="invoicePrefix"
            value={formData.invoicePrefix}
            onChange={handleChange}
            disabled={loading}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Next Invoice: <span className="font-semibold text-slate-900">{previewInvoiceNumber}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Invoice Watermark</div>
              <div className="text-xs text-slate-500">Shown in the invoice background.</div>
            </div>
            <Switch
              checked={formData.watermarkEnabled}
              onCheckedChange={(value) =>
                setFormData((current) => ({ ...current, watermarkEnabled: value }))
              }
            />
          </div>
          <textarea
            placeholder="Watermark Text"
            name="watermarkText"
            value={formData.watermarkText}
            onChange={handleChange}
            disabled={loading || !formData.watermarkEnabled}
            rows={3}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-100"
          />
          <div className="mt-2 text-xs text-slate-500">
            Tip: Use line breaks for multi-line watermark text.
          </div>
        </div>

        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={handleSave}
          disabled={loading || saving}
        >
          {saving ? 'Saving...' : 'Save Invoice Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
