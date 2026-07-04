'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Store, Eye } from 'lucide-react';

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
    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Store className="h-5 w-5 text-stitch-primary" />
          Shop Information
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your shop name and contact details. Changes appear on printed bills instantly.
        </p>
      </div>

      {/* Two-column layout: Form + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Form Side */}
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
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <Button
            className="w-full bg-stitch-primary hover:bg-stitch-primary/90 text-white font-bold gap-2"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Shop Settings'}
          </Button>
        </div>

        {/* Live Receipt Preview */}
        <div className="lg:sticky lg:top-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-stitch-primary" />
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Live Bill Preview</p>
          </div>
          <div className="border border-dashed border-border rounded-xl bg-surface p-5 shadow-inner font-mono text-[11px] leading-relaxed text-foreground min-h-[280px]">
            {/* Header */}
            <div className="text-center space-y-0.5 border-b border-border pb-3 mb-3">
              <p className="text-sm font-extrabold text-foreground uppercase tracking-wide">
                {formData.shopName || 'Your Shop Name'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formData.addressLine1 || 'Address Line 1'}
                {formData.addressLine2 ? `, ${formData.addressLine2}` : ''}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Ph: {formData.phone || '0000000000'} | {formData.email || 'email@shop.com'}
              </p>
              {formData.gstin && (
                <p className="text-[10px] font-semibold text-foreground uppercase">GSTIN: {formData.gstin}</p>
              )}
            </div>

            {/* Sample Line Items */}
            <div className="space-y-1 text-[10px] text-muted-foreground border-b border-border pb-3 mb-3">
              <div className="flex justify-between font-bold text-foreground border-b border-border pb-1">
                <span>Medicine Name</span>
                <span>Qty × Rate</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between">
                <span>Ashwagandha Tab (60s)</span>
                <span>2 × ₹120</span>
                <span>₹240</span>
              </div>
              <div className="flex justify-between">
                <span>Triphala Churna 100g</span>
                <span>1 × ₹85</span>
                <span>₹85</span>
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between"><span>Sub Total</span><span>₹325.00</span></div>
              <div className="flex justify-between"><span>GST (12%)</span><span>₹39.00</span></div>
              <div className="flex justify-between font-extrabold text-foreground text-xs pt-1 border-t border-border mt-1">
                <span>GRAND TOTAL</span><span>₹364.00</span>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-[9px] text-muted-foreground mt-4 border-t border-border pt-2">
              Thank you for your purchase! Get well soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
