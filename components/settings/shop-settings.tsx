'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Store, Eye } from 'lucide-react';
import InvoiceTemplate, { InvoiceSettings, SaleDetails } from '@/components/InvoiceTemplate';

// Sample sale for the preview; GST is included in the amounts.
const SAMPLE_SALE: SaleDetails = {
  id: 'preview',
  invoiceNumber: 'INV-SAMPLE-001',
  createdAt: new Date().toISOString(),
  paymentMode: 'CASH',
  subtotal: 325,
  discountTotal: 0,
  gstTotal: 29.76,
  grandTotal: 325,
  customer: { name: 'Sample Customer', phone: '9876543210', address: 'City, State' },
  saleItems: [
    {
      id: 'sample-1',
      quantity: 2,
      mrp: 120,
      rate: 120,
      discount: 0,
      gst: 25.71,
      gstPercent: 12,
      amount: 240,
      medicine: { name: 'Ashwagandha Tab (60s)', hsn: '30049011' },
      batch: { batchNumber: 'ASH-001', expiryDate: '2028-06-30' },
    },
    {
      id: 'sample-2',
      quantity: 1,
      mrp: 85,
      rate: 85,
      discount: 0,
      gst: 4.05,
      gstPercent: 5,
      amount: 85,
      medicine: { name: 'Triphala Churna 100g', hsn: '30049011' },
      batch: { batchNumber: 'TRI-014', expiryDate: '2027-12-31' },
    },
  ],
};

// Invoice is laid out for A4 (~794px wide). Render it at that width and
// scale it down to whatever the preview column allows.
const INVOICE_WIDTH = 794;

function ScaledInvoicePreview({ children }: { children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    if (!frame || !page) return;
    const update = () => {
      // The invoice table can be wider than A4; fit whatever it really needs.
      const natural = Math.max(INVOICE_WIDTH, page.scrollWidth);
      const next = Math.min(1, frame.clientWidth / natural);
      setScale(next);
      setHeight(page.offsetHeight * next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="w-full overflow-hidden" style={{ height }}>
      <div
        ref={pageRef}
        style={{ width: 'max-content', minWidth: INVOICE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function ShopSettings() {
  const [formData, setFormData] = useState({
    shopName: '',
    addressLine1: '',
    addressLine2: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicense: '',
    state: '',
    stateCode: '',
    invoiceTerms: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({ invoicePrefix: 'INV' });

  useEffect(() => {
    axios
      .get('/api/settings/invoice')
      .then((res) => {
        if (res.data.success) setInvoiceSettings(res.data.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchShopSettings = async () => {
      try {
        const response = await axios.get('/api/settings/shop');
        if (response.data.success) {
          const settings = response.data.data;
          setFormData({
            shopName: settings.shopName || '',
            addressLine1: settings.addressLine1 || '',
            addressLine2: settings.addressLine2 || '',
            phone: settings.phone || '',
            email: settings.email || '',
            gstin: settings.gstin || '',
            drugLicense: settings.drugLicense || '',
            state: settings.state || '',
            stateCode: settings.stateCode || '',
            invoiceTerms: settings.invoiceTerms || '',
          });
        }
      } catch (error) {
        console.error('Failed to load shop settings', error);
      } finally {
        setLoading(false);
      }
    };
    fetchShopSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put('/api/settings/shop', formData);
      if (response.data.success) {
        const settings = response.data.data;
        setFormData({
          shopName: settings.shopName || '',
          addressLine1: settings.addressLine1 || '',
          addressLine2: settings.addressLine2 || '',
          phone: settings.phone || '',
          email: settings.email || '',
          gstin: settings.gstin || '',
          drugLicense: settings.drugLicense || '',
          state: settings.state || '',
          stateCode: settings.stateCode || '',
          invoiceTerms: settings.invoiceTerms || '',
        });
        toast.success('Shop settings saved successfully.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('shop-settings-updated', { detail: response.data.data }));
        }
      } else {
        toast.error(response.data.message || 'Failed to save shop settings.');
      }
    } catch (error) {
      const serverMessage = axios.isAxiosError(error) ? error.response?.data?.message : null;
      toast.error(serverMessage || 'Failed to save shop settings.');
    } finally {
      setSaving(false);
    }
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-footnote font-medium text-muted-foreground mb-1.5">
      {children}
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-title-2 text-foreground flex items-center gap-2">
          <Store className="h-5 w-5 stroke-[1.75] text-primary" />
          Shop Information
        </h2>
        <p className="text-callout text-muted-foreground mt-1">
          Manage your shop name and contact details. Changes appear on printed bills instantly.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start">
      <div className="space-y-4">
        <div>
          <Label>Shop Name</Label>
          <Input
            placeholder="e.g. Ayurveda Pharmacy"
            name="shopName"
            value={formData.shopName}
            onChange={handleChange}
            disabled={loading}
            className="font-medium"
          />
        </div>
        <div>
          <Label>Address Line 1</Label>
          <Input
            placeholder="Street / Building"
            name="addressLine1"
            value={formData.addressLine1}
            onChange={handleChange}
            disabled={loading}
          />
        </div>
        <div>
          <Label>Address Line 2</Label>
          <Input
            placeholder="City, State, PIN"
            name="addressLine2"
            value={formData.addressLine2}
            onChange={handleChange}
            disabled={loading}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Phone</Label>
            <Input
              placeholder="+91 98765 43210"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              disabled={loading}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              placeholder="shop@email.com"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
          </div>
        </div>
        <div>
          <Label>GSTIN</Label>
          <Input
            placeholder="27AADCB1234L1ZM"
            name="gstin"
            value={formData.gstin}
            onChange={handleChange}
            disabled={loading}
            className="font-mono uppercase"
          />
        </div>
        <div>
          <Label>Drug License No.</Label>
          <Input
            placeholder="e.g. 20B: KA-B-123456, 21B: KA-B-123457"
            name="drugLicense"
            value={formData.drugLicense}
            onChange={handleChange}
            disabled={loading}
            className="font-mono"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>State (Place of Supply)</Label>
            <Input
              placeholder="e.g. Uttar Pradesh"
              name="state"
              value={formData.state}
              onChange={handleChange}
              disabled={loading}
            />
          </div>
          <div>
            <Label>State Code</Label>
            <Input
              placeholder="e.g. 09"
              name="stateCode"
              value={formData.stateCode}
              onChange={handleChange}
              disabled={loading}
              className="font-mono"
            />
          </div>
        </div>
        <div>
          <Label>Invoice Terms / Declaration</Label>
          <textarea
            placeholder="e.g. Goods once sold will not be taken back. Subject to local jurisdiction."
            name="invoiceTerms"
            value={formData.invoiceTerms}
            onChange={handleChange}
            disabled={loading}
            rows={2}
            className="w-full rounded-control border border-transparent bg-fill px-3 py-2 text-[15px] text-foreground placeholder:text-label-tertiary focus:bg-surface focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/25 disabled:opacity-50 transition-[background-color,border-color,box-shadow] duration-200"
          />
        </div>
        <Button
          className="w-full font-semibold"
          onClick={handleSave}
          disabled={loading || saving}
        >
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Shop Settings'}
        </Button>
      </div>

      {/* Invoice preview: the real invoice layout with a sample sale */}
      <div className="xl:sticky xl:top-6">
        <div className="flex items-center gap-2 mb-2.5">
          <Eye className="h-4 w-4 stroke-[1.75] text-muted-foreground" />
          <p className="text-footnote font-semibold text-muted-foreground">Invoice preview</p>
        </div>
        <div className="rounded-card bg-surface-muted p-3 sm:p-4">
          <ScaledInvoicePreview>
            <InvoiceTemplate sale={SAMPLE_SALE} settings={invoiceSettings} shopSettings={formData} />
          </ScaledInvoicePreview>
        </div>
      </div>
      </div>
    </div>
  );
}
