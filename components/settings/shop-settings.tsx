import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ShopSettings() {
  const [formData, setFormData] = useState({
    shopName: '',
    addressLine1: '',
    addressLine2: '',
    phone: '',
    email: '',
    gstin: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    setMessage('');
    setError('');

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
        });
        setMessage('Shop settings saved successfully.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('shop-settings-updated', { detail: response.data.data })
          );
        }
      } else {
        setError(response.data.message || 'Failed to save shop settings.');
      }
    } catch (error) {
      console.error('Failed to save shop settings', error);
      const serverMessage = axios.isAxiosError(error)
        ? error.response?.data?.message
        : 'Failed to save shop settings.';
      setError(serverMessage || 'Failed to save shop settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Shop Information</h2>
          <p className="text-sm text-slate-500">Manage shop name and contact details.</p>
        </div>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Input
          placeholder="Shop Name"
          name="shopName"
          value={formData.shopName}
          onChange={handleChange}
          disabled={loading}
        />
        <Input
          placeholder="Address Line 1"
          name="addressLine1"
          value={formData.addressLine1}
          onChange={handleChange}
          disabled={loading}
        />
        <Input
          placeholder="Address Line 2"
          name="addressLine2"
          value={formData.addressLine2}
          onChange={handleChange}
          disabled={loading}
        />
        <Input
          placeholder="Phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          disabled={loading}
        />
        <Input
          placeholder="Email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          disabled={loading}
        />
        <Input
          placeholder="GSTIN"
          name="gstin"
          value={formData.gstin}
          onChange={handleChange}
          disabled={loading}
        />

        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={handleSave}
          disabled={loading || saving}
        >
          {saving ? 'Saving...' : 'Save Shop Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
