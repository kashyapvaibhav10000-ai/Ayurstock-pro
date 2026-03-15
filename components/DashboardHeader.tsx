'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { Bell, Search, Settings, Store, LogOut, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthUser } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Image from 'next/image';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/billing': 'Billing',
  '/dashboard/medicines': 'Medicines',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/purchases': 'Purchases',
  '/dashboard/suppliers': 'Suppliers',
  '/dashboard/reports': 'Reports',
  '/dashboard/settings': 'Settings',
};

interface ShopInfo {
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  phone: string;
  email: string;
  gstin: string;
}

export default function DashboardHeader({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const pageTitle = useMemo(() => pageTitles[pathname] || 'AyurStock Pro', [pathname]);

  useEffect(() => {
    const fetchShopInfo = async () => {
      try {
        const response = await axios.get('/api/settings/shop');
        if (response.data.success) {
          setShopInfo(response.data.data);
        }
      } catch (error) {
        console.error('Failed to load shop info:', error);
      }
    };

    fetchShopInfo();

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as ShopInfo | undefined;
      if (detail) {
        setShopInfo(detail);
      } else {
        fetchShopInfo();
      }
    };

    window.addEventListener('shop-settings-updated', handleUpdate);
    return () => window.removeEventListener('shop-settings-updated', handleUpdate);
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" width={80} height={80} alt="AyurStock Pro Logo" />
          <span className="text-xl font-semibold text-slate-900">{pageTitle}</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search modules, medicines, batches..." className="rounded-xl border-slate-200 bg-white pl-9" />
          </div>
          <Button variant="outline" size="icon" className="rounded-xl border-slate-200 bg-white">
            <Bell className="h-4 w-4" />
          </Button>
          <button
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:bg-slate-50"
            onClick={() => setModalOpen(true)}
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 text-sm font-semibold text-emerald-700">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500">{user.role}</div>
            </div>
          </button>
        </div>
      </header>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[500px] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <DialogHeader>
            <DialogTitle>Shop Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-700">
            {shopInfo ? (
              <>
                <div className="text-base font-semibold text-slate-900">{shopInfo.shopName}</div>
                <div>{shopInfo.addressLine1}</div>
                {shopInfo.addressLine2 ? <div>{shopInfo.addressLine2}</div> : null}
                <div>Phone: {shopInfo.phone}</div>
                <div>Email: {shopInfo.email}</div>
                <div className="font-semibold text-slate-900">GSTIN: {shopInfo.gstin}</div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Loading shop details...</div>
            )}
          </div>
          <DialogFooter className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setModalOpen(false);
                router.push('/dashboard/settings?tab=shop');
              }}
            >
              <Store className="h-4 w-4" />
              Edit Shop Info
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setModalOpen(false);
                router.push('/dashboard/settings');
              }}
            >
              <Settings className="h-4 w-4" />
              Go to Settings
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
