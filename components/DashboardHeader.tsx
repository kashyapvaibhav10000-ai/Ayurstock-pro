'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { Bell, Search, Settings, Store, LogOut, X, Menu } from 'lucide-react';
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

interface DashboardHeaderProps {
  user: AuthUser;
  onMenuToggle: () => void;
}

export default function DashboardHeader({ user, onMenuToggle }: DashboardHeaderProps) {
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
      <header className="flex items-center justify-between border-b border-surface-border bg-surface px-4 sm:px-6 py-4 shadow-sm h-[81px]">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="xl:hidden h-9 w-9"
            onClick={onMenuToggle}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="xl:hidden flex items-center gap-2 mr-2">
            <Image src="/logo.png" width={32} height={32} alt="AyurStock Pro" className="w-8 h-8" />
          </div>
          <span className="text-lg sm:text-xl font-bold text-text-primary truncate">{pageTitle}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input placeholder="Search everything..." className="rounded-xl border-surface-border bg-surface-muted pl-9 h-10" />
          </div>
          
          <Button variant="outline" size="icon" className="hidden sm:flex rounded-xl border-surface-border h-10 w-10">
            <Bell className="h-4 w-4 text-text-secondary" />
          </Button>
          
          <button
            className="flex items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border border-surface-border bg-surface p-1 sm:px-3 sm:py-1.5 shadow-sm transition hover:bg-surface-muted"
            onClick={() => setModalOpen(true)}
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center overflow-hidden rounded-[10px] bg-primary-light text-sm font-semibold text-primary">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="hidden text-left sm:block pr-1">
              <div className="text-sm font-bold text-text-primary leading-tight">{user.name}</div>
              <div className="text-[11px] font-medium text-text-secondary">{user.role}</div>
            </div>
          </button>
        </div>
      </header>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-[400px] rounded-2xl border border-surface-border bg-surface shadow-xl">
          <DialogHeader>
            <DialogTitle>Shop Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-text-primary bg-surface-muted p-4 rounded-xl border border-surface-border/50">
            {shopInfo ? (
              <>
                <div className="text-base font-bold text-primary">{shopInfo.shopName}</div>
                <div className="text-text-secondary">{shopInfo.addressLine1}</div>
                {shopInfo.addressLine2 ? <div className="text-text-secondary">{shopInfo.addressLine2}</div> : null}
                <div className="mt-2 pt-2 border-t border-surface-border/50">
                  <span className="text-text-secondary">Phone:</span> {shopInfo.phone}
                </div>
                <div>
                  <span className="text-text-secondary">Email:</span> {shopInfo.email}
                </div>
                <div className="mt-2 pt-2 border-t border-surface-border/50 font-semibold text-text-primary bg-primary-light/50 p-2 rounded-lg inline-block">
                  GSTIN: {shopInfo.gstin}
                </div>
              </>
            ) : (
              <div className="text-sm text-text-muted flex items-center gap-2 pb-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></span>
                Loading shop details...
              </div>
            )}
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => {
                setModalOpen(false);
                router.push('/dashboard/settings?tab=shop');
              }}
            >
              <Store className="h-4 w-4" />
              Edit Shop
            </Button>
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => {
                setModalOpen(false);
                router.push('/dashboard/settings');
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="destructive"
              className="gap-2 w-full sm:w-auto"
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
