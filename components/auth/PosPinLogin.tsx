'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { KeyRound, MonitorSmartphone } from 'lucide-react';
import { Input } from '@/components/ui/input';

type DeviceStatus = { paired: false } | { paired: true; deviceName: string; shopName: string };

/**
 * PIN login for paired POS devices. An unpaired browser only sees the
 * "Pair this device" entry; the code comes from Settings > POS Devices.
 */
export default function PosPinLogin({ onLoggedIn }: { onLoggedIn: (data: { user: unknown }) => void }) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [pairing, setPairing] = useState(false);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios
      .get('/api/auth/pos-device')
      .then((res) => setStatus(res.data.data))
      .catch(() => setStatus({ paired: false }));
  }, []);

  const errorOf = (err: any, fallback: string) => err.response?.data?.error || err.response?.data?.message || fallback;

  const pairDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/pos-device', { code });
      setStatus(res.data.data);
      setPairing(false);
      setCode('');
    } catch (err: any) {
      setError(errorOf(err, 'Pairing failed.'));
    } finally {
      setLoading(false);
    }
  };

  const pinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/pos-login', { pin });
      if (res.data.success) onLoggedIn(res.data.data);
    } catch (err: any) {
      if (err.response?.data?.code === 'DEVICE_NOT_PAIRED') setStatus({ paired: false });
      setError(errorOf(err, 'PIN login failed.'));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  if (!status) return null;

  const errorBox = error && <p className="text-xs font-bold text-red-600">{error}</p>;

  if (status.paired) {
    return (
      <form onSubmit={pinLogin} className="mt-8 space-y-3 rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
          PIN login · {status.deviceName} · {status.shopName}
        </p>
        {errorBox}
        <div className="flex gap-2">
          <Input
            className="h-11 rounded-xl bg-slate-50 border-slate-200 text-slate-900 font-mono tracking-[0.5em] text-center"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button
            type="submit"
            disabled={loading || pin.length !== 4}
            className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl disabled:opacity-60"
          >
            Enter
          </button>
        </div>
      </form>
    );
  }

  if (!pairing) {
    return (
      <button
        type="button"
        onClick={() => setPairing(true)}
        className="mt-6 w-full text-[11px] text-slate-500 hover:text-emerald-600 flex items-center justify-center gap-1.5"
      >
        <MonitorSmartphone className="h-3.5 w-3.5" />
        Pair this device for PIN login
      </button>
    );
  }

  return (
    <form onSubmit={pairDevice} className="mt-8 space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">
        Enter the 8-character code from <span className="font-bold">Settings › POS Devices</span> (valid 10 minutes, one use).
      </p>
      {errorBox}
      <div className="flex gap-2">
        <Input
          className="h-11 rounded-xl bg-slate-50 border-slate-200 text-slate-900 font-mono uppercase tracking-widest"
          autoComplete="off"
          maxLength={11}
          placeholder="ABCD-EFGH"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading || code.replace(/[\s-]/g, '').length !== 8}
          className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl disabled:opacity-60"
        >
          Pair
        </button>
      </div>
    </form>
  );
}
