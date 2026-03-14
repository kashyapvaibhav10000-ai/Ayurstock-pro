import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ProfileSettings() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    avatarUrl: '',
  });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get('/api/settings/profile');
        if (response.data.success) {
          const profile = response.data.data;
          setFormData({
            name: profile.name || '',
            email: profile.email || '',
            phone: profile.phone || '',
            password: '',
            avatarUrl: profile.avatarUrl || '',
          });
          setPreviewUrl(profile.avatarUrl || '');
        }
      } catch (error) {
        console.error('Failed to load profile settings', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const initials = useMemo(() => {
    if (!formData.name) return 'AD';
    return formData.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [formData.name]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setPreviewUrl(result);
      setFormData((current) => ({ ...current, avatarUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put('/api/settings/profile', {
        ...formData,
        password: formData.password || null,
        phone: formData.phone || null,
      });
      if (response.data.success) {
        const profile = response.data.data;
        setFormData((current) => ({
          ...current,
          name: profile.name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          password: '',
          avatarUrl: profile.avatarUrl || '',
        }));
        setPreviewUrl(profile.avatarUrl || '');
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          localStorage.setItem(
            'user',
            JSON.stringify({
              ...parsed,
              name: profile.name,
              email: profile.email,
              phone: profile.phone,
              avatarUrl: profile.avatarUrl,
            })
          );
        }
        router.refresh();
        alert('Profile updated successfully.');
      }
    } catch (error) {
      console.error('Failed to save profile settings', error);
      alert('Failed to save profile settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.refresh();
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-lg font-semibold">Profile Settings</h2>
          <p className="text-sm text-slate-500">Manage your personal details and login info.</p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 text-lg font-semibold text-emerald-700">
              {previewUrl ? (
                <img src={previewUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Profile Photo</div>
              <div className="text-xs text-slate-500">Upload a square image for best results.</div>
            </div>
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={loading}
              className="block text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Name"
            name="name"
            value={formData.name}
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
            placeholder="Phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            disabled={loading}
          />
          <Input
            placeholder="New Password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
