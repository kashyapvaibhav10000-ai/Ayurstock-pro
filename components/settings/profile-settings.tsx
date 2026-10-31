import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUsernameAvailability, usernameBlocked } from '@/hooks/use-username-availability';
import UsernameStatusLine from '@/components/settings/username-status';
import { superAdminIdentifierWarning } from '@/lib/super-admin-warning';

export default function ProfileSettings() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    avatarUrl: '',
    pin: '',
    currentPassword: '',
  });
  // Saved values: unchanged username is not "taken"; email/username changes need the current password.
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState('');
  const [account, setAccount] = useState<{ role: string; hasPin: boolean; superAdminVia: Array<'email' | 'username'> }>({
    role: '',
    hasPin: false,
    superAdminVia: [],
  });
  const [removePin, setRemovePin] = useState(false);
  const usernameStatus = useUsernameAvailability(formData.username, savedUsername);
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
            username: profile.username || '',
            phone: profile.phone || '',
            password: '',
            avatarUrl: profile.avatarUrl || '',
            pin: '',
            currentPassword: '',
          });
          setSavedUsername(profile.username || null);
          setSavedEmail(profile.email || '');
          setAccount({ role: profile.role, hasPin: Boolean(profile.hasPin), superAdminVia: profile.superAdminVia || [] });
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

  const emailChanged = formData.email.trim().toLowerCase() !== savedEmail;
  const usernameChanged = formData.username.trim().toLowerCase() !== (savedUsername ?? '');
  const needsCurrentPassword = emailChanged || usernameChanged || Boolean(formData.password);
  const isAdmin = account.role === 'ADMIN';

  const handleSave = async () => {
    if (needsCurrentPassword && !formData.currentPassword) {
      toast.error('Enter your current password to change your email, username or password.');
      return;
    }
    if (formData.pin && !/^\d{4}$/.test(formData.pin)) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }
    const warning = superAdminIdentifierWarning(account.superAdminVia, { email: emailChanged, username: usernameChanged });
    if (warning && !window.confirm(`${warning}\n\nSave anyway?`)) return;

    setSaving(true);
    try {
      const response = await axios.put('/api/settings/profile', {
        name: formData.name,
        email: formData.email,
        avatarUrl: formData.avatarUrl,
        password: formData.password || null,
        phone: formData.phone || null,
        username: formData.username.trim() || null,
        // PIN: only admins, only when set or removed.
        ...(isAdmin && (formData.pin || removePin) ? { pin: removePin ? null : formData.pin } : {}),
        currentPassword: needsCurrentPassword ? formData.currentPassword : null,
      });
      if (response.data.success) {
        const profile = response.data.data;
        setFormData((current) => ({
          ...current,
          name: profile.name || '',
          email: profile.email || '',
          username: profile.username || '',
          phone: profile.phone || '',
          password: '',
          avatarUrl: profile.avatarUrl || '',
          pin: '',
          currentPassword: '',
        }));
        setSavedUsername(profile.username || null);
        setSavedEmail(profile.email || '');
        setAccount({ role: profile.role, hasPin: Boolean(profile.hasPin), superAdminVia: profile.superAdminVia || [] });
        setRemovePin(false);
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
              username: profile.username,
              phone: profile.phone,
              avatarUrl: profile.avatarUrl,
            })
          );
        }
        router.refresh();
        toast.success('Profile updated successfully.');
      }
    } catch (error) {
      console.error('Failed to save profile settings', error);
      toast.error(
        (axios.isAxiosError(error) && error.response?.data?.error) || 'Failed to save profile settings.'
      );
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
          <p className="text-sm text-muted-foreground">Manage your personal details and login info.</p>
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
              <div className="text-sm font-semibold text-foreground">Profile Photo</div>
              <div className="text-xs text-muted-foreground">Upload a square image for best results.</div>
            </div>
          </div>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={loading}
              className="block text-sm text-muted-foreground file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
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
          <div className="space-y-1">
            <Input
              placeholder="Username (for login)"
              name="username"
              autoComplete="username"
              spellCheck={false}
              value={formData.username}
              onChange={handleChange}
              disabled={loading}
            />
            <UsernameStatusLine status={usernameStatus} />
          </div>
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
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            disabled={loading}
          />
          {isAdmin && (
            <div className="space-y-1">
              <Input
                placeholder={account.hasPin ? 'POS PIN: •••• (leave blank to keep)' : 'POS PIN (4 digits)'}
                name="pin"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={formData.pin}
                onChange={handleChange}
                disabled={loading || removePin}
              />
              {account.hasPin && (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={removePin} onChange={(e) => setRemovePin(e.target.checked)} />
                  Remove POS PIN
                </label>
              )}
            </div>
          )}
          {needsCurrentPassword && (
            <div className="space-y-1 md:col-span-2">
              <Input
                placeholder="Current password (required to change email, username or password)"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={formData.currentPassword}
                onChange={handleChange}
                disabled={loading}
              />
              {superAdminIdentifierWarning(account.superAdminVia, { email: emailChanged, username: usernameChanged }) && (
                <p className="text-[11px] text-amber-600">
                  {superAdminIdentifierWarning(account.superAdminVia, { email: emailChanged, username: usernameChanged })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handleSave}
            disabled={loading || saving || usernameBlocked(usernameStatus)}
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
