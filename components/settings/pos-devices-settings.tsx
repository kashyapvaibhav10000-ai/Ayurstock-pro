'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, MonitorSmartphone, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Device = {
  id: string;
  name: string;
  pairedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  lockedUntil: string | null;
};

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Settings > POS Devices. PIN login only works on devices paired here: the
 * admin creates a one-time code, the cashier enters it on the device's login
 * screen ("Pair this device").
 */
export default function PosDevicesSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [pairing, setPairing] = useState<{ code: string; deviceName: string; expiresAt: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/pos-devices');
      if (res.data.success) setDevices(res.data.data);
    } catch {
      toast.error('Failed to load POS devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const openPairModal = () => {
    setName('');
    setPairing(null);
    setIsModalOpen(true);
  };

  const createCode = async () => {
    if (!name.trim()) {
      toast.error('Give the device a name, e.g. "Counter 1"');
      return;
    }
    setActionLoading(true);
    try {
      const res = await axios.post('/api/pos-devices', { name: name.trim() });
      if (res.data.success) setPairing(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create pairing code');
    } finally {
      setActionLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    if (pairing) fetchDevices();
  };

  const revoke = async (device: Device) => {
    if (!confirm(`Revoke "${device.name}"? PIN login stops working on it immediately.`)) return;
    try {
      await axios.delete(`/api/pos-devices/${device.id}`);
      toast.success('Device revoked');
      fetchDevices();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to revoke device');
    }
  };

  const active = devices.filter((d) => !d.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-emerald-600" /> POS Devices
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            PIN login only works on devices paired here. Pair a device, then on its login screen choose
            &quot;Pair this device&quot; and enter the code.
          </p>
        </div>
        <Button onClick={openPairModal} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Pair device
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : active.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">No paired devices.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-semibold">Name</th>
                <th className="p-3 font-semibold">Paired</th>
                <th className="p-3 font-semibold">Last used</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {active.map((device) => (
                <tr key={device.id} className="border-t">
                  <td className="p-3 font-medium">
                    {device.name}
                    {device.lockedUntil && new Date(device.lockedUntil) > new Date() && (
                      <span className="ml-2 text-[11px] text-amber-600">locked (wrong PINs)</span>
                    )}
                  </td>
                  <td className="p-3">{fmt(device.pairedAt)}</td>
                  <td className="p-3">{fmt(device.lastUsedAt)}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => revoke(device)} className="text-red-600">
                      <Trash2 className="h-4 w-4 mr-1" /> Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => (open ? setIsModalOpen(true) : closeModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pair a POS device</DialogTitle>
          </DialogHeader>
          {pairing ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">Enter this code on &quot;{pairing.deviceName}&quot;:</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em]">
                {pairing.code.slice(0, 4)}-{pairing.code.slice(4)}
              </p>
              <p className="text-xs text-muted-foreground">
                One use only. Expires at {new Date(pairing.expiresAt).toLocaleTimeString()}.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="pos-device-name">Device name</Label>
              <Input
                id="pos-device-name"
                placeholder="Counter 1"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            {pairing ? (
              <Button onClick={closeModal}>Done</Button>
            ) : (
              <Button onClick={createCode} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                {actionLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create code
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
