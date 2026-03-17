'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { Bell, Search, Settings, Store, LogOut, X, Menu, Building2, Phone, Mail, FileText, UserCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthUser } from '@/types';
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
  const [profileOpen, setProfileOpen] = useState(false);

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
      <header className="flex items-center justify-between border-b border-surface-border bg-surface px-4 sm:px-6 py-4 shadow-sm h-[81px] relative z-20">
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
            className="flex items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border border-surface-border bg-surface p-1 sm:px-3 sm:py-1.5 shadow-sm transition hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setProfileOpen(true)}
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

      {/* Slide-over Profile Panel */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Overlay */}
          <div 
            className="absolute inset-0 bg-slate-900/40 transition-opacity"
            onClick={() => setProfileOpen(false)}
          />
          
          {/* Panel */}
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md transform transition-all shadow-2xl bg-surface h-full flex flex-col pt-4">
              
              {/* Panel Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <UserCircle className="h-5 w-5 text-primary" />
                  Your Profile 
                </h2>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setProfileOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Panel Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* User Info Segment */}
                <div className="flex items-center gap-4 bg-surface-muted p-4 rounded-2xl border border-surface-border">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-primary-light text-lg font-bold text-primary shrink-0">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-text-primary truncate">{user.name}</p>
                    <p className="text-sm text-text-secondary capitalize">{user.role.toLowerCase()}</p>
                  </div>
                </div>

                <hr className="border-surface-border" />

                {/* Shop Info Segment */}
                <div>
                  <h3 className="text-sm font-bold tracking-wider text-text-secondary uppercase mb-4">Shop Details</h3>
                  {shopInfo ? (
                    <div className="space-y-4">
                      <div className="flex gap-3 items-start">
                        <Building2 className="h-5 w-5 text-text-muted shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{shopInfo.shopName}</p>
                          <p className="text-sm text-text-secondary mt-1">{shopInfo.addressLine1}</p>
                          {shopInfo.addressLine2 && <p className="text-sm text-text-secondary">{shopInfo.addressLine2}</p>}
                        </div>
                      </div>

                      <div className="flex gap-3 items-center">
                        <Phone className="h-5 w-5 text-text-muted shrink-0" />
                        <p className="text-sm text-text-primary">{shopInfo.phone || 'Not provided'}</p>
                      </div>

                      <div className="flex gap-3 items-center">
                        <Mail className="h-5 w-5 text-text-muted shrink-0" />
                        <p className="text-sm text-text-primary">{shopInfo.email || 'Not provided'}</p>
                      </div>

                      <div className="flex gap-3 items-center border border-surface-border bg-slate-50 p-3 rounded-xl mt-2">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-text-secondary uppercase">GSTIN / Tax ID</p>
                          <p className="text-sm font-mono font-semibold text-text-primary mt-0.5">{shopInfo.gstin}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-text-muted flex items-center gap-2 py-4">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></span>
                      Fetching shop details...
                    </div>
                  )}
                </div>

              </div>
              
              {/* Panel Footer Actions */}
              <div className="p-6 border-t border-surface-border bg-slate-50 space-y-3">
                <Button
                  className="w-full gap-2 justify-start h-11 bg-white hover:bg-slate-100 text-text-primary border border-surface-border"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings?tab=shop');
                  }}
                >
                  <Store className="h-4 w-4 text-text-muted" />
                  Edit Shop Profile
                </Button>
                <Button
                  className="w-full gap-2 justify-start h-11 bg-white hover:bg-slate-100 text-text-primary border border-surface-border"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings');
                  }}
                >
                  <Settings className="h-4 w-4 text-text-muted" />
                  System Settings
                </Button>
                <Button
                  variant="destructive"
                  className="w-full gap-2 h-11"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Log Out Securely
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
