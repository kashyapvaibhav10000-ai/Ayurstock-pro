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
import ThemeToggle from '@/components/ThemeToggle';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/billing': 'Billing',
  '/dashboard/medicines': 'Medicine Master',
  '/dashboard/inventory': 'Inventory',
  '/dashboard/purchases': 'Purchases',
  '/dashboard/suppliers': 'Suppliers',
  '/dashboard/returns': 'Returns',
  '/dashboard/credits': 'Credit Tracking',
  '/dashboard/sales-history': 'Sales History',
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
      <header className="flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4 sm:px-6 py-4 h-[81px] relative z-20">
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
            <Image src="/logo.png" width={32} height={32} alt="AyurStock Pro" className="w-8 h-8 rounded-lg bg-white p-0.5" />
          </div>
          <span className="text-lg sm:text-xl font-black text-foreground tracking-tighter uppercase truncate">{pageTitle}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative hidden md:block w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search everything..." className="rounded-2xl border-border bg-surface shadow-soft pl-9 h-10 transition-shadow focus-visible:shadow-bento text-foreground" />
          </div>

          {/* Theme toggle: available to every role (Admin, Manager, Cashier), on every
              device including mobile — this is the fix for the "stuck theme" bug. */}
          <ThemeToggle />

          <Button variant="outline" size="icon" className="hidden sm:flex rounded-2xl border-border bg-surface shadow-soft hover:shadow-bento h-10 w-10">
            <Bell className="h-4 w-4 text-muted-foreground" />
          </Button>
          
          <button
            className="group flex items-center gap-2 sm:gap-3 rounded-2xl border border-border bg-surface p-1 sm:px-1.5 sm:py-1.5 shadow-soft transition-all hover:shadow-bento hover:border-primary/20 focus:outline-none"
            onClick={() => setProfileOpen(true)}
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-sm font-semibold text-primary transition-colors group-hover:bg-primary/20">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="hidden text-left sm:block pr-3">
              <div className="text-sm font-bold text-foreground leading-tight">{user.name}</div>
              <div className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">{user.role}</div>
            </div>
          </button>
        </div>
      </header>

      {/* Slide-over Profile Panel */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 transition-opacity backdrop-blur-[2px]"
            onClick={() => setProfileOpen(false)}
          />
          
          {/* Panel */}
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-md transform transition-all shadow-2xl bg-surface h-full flex flex-col pt-4 border-l border-border backdrop-blur-3xl">
              
              {/* Panel Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                <h2 className="text-lg font-black text-foreground flex items-center gap-3 uppercase tracking-tight">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <UserCircle className="h-5 w-5 text-primary" />
                  </div>
                  Clinical Identity
                </h2>
                <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-surface-muted" onClick={() => setProfileOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Panel Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* User Info Segment */}
                <div className="flex items-center gap-5 bg-surface-muted/30 p-5 rounded-2xl border border-border shadow-inner">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-xl font-black text-primary shrink-0 border border-primary/20">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-black text-foreground truncate tracking-tight">{user.name}</p>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">{user.role}</p>
                  </div>
                </div>

                <hr className="border-border" />

                {/* Shop Info Segment */}
                <div>
                  <h3 className="text-[10px] font-black tracking-[0.25em] text-muted-foreground/60 uppercase mb-5 ml-1">Foundation Metadata</h3>
                  {shopInfo ? (
                    <div className="space-y-5">
                      <div className="flex gap-4 items-start">
                        <div className="h-10 w-10 rounded-xl bg-surface-muted flex items-center justify-center border border-border shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-foreground uppercase tracking-tight">{shopInfo.shopName}</p>
                          <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-wide">{shopInfo.addressLine1}</p>
                          {shopInfo.addressLine2 && <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{shopInfo.addressLine2}</p>}
                        </div>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="h-10 w-10 rounded-xl bg-surface-muted flex items-center justify-center border border-border shrink-0">
                          <Phone className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-[11px] font-black text-foreground uppercase tracking-widest">{shopInfo.phone || 'NULL_VCTR'}</p>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="h-10 w-10 rounded-xl bg-surface-muted flex items-center justify-center border border-border shrink-0">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-[11px] font-black text-foreground uppercase tracking-widest">{shopInfo.email || 'NULL_VCTR'}</p>
                      </div>

                      <div className="flex gap-4 items-center border border-primary/20 bg-primary/5 p-4 rounded-2xl mt-4 shadow-soft">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-primary uppercase tracking-[0.25em]">GSTIN_AUTH_PTRN</p>
                          <p className="text-sm font-mono font-black text-foreground mt-0.5 tracking-tighter">{shopInfo.gstin}</p>
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
              <div className="p-6 border-t border-border bg-surface-muted/30 space-y-3">
                <Button
                  className="w-full gap-3 justify-start h-12 bg-surface hover:bg-surface-muted text-[11px] font-black uppercase tracking-widest text-foreground border border-border rounded-xl transition-all"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings?tab=shop');
                  }}
                >
                  <Store className="h-4 w-4 text-primary" />
                  Calibrate Shop Metadata
                </Button>
                <Button
                  className="w-full gap-3 justify-start h-12 bg-surface hover:bg-surface-muted text-[11px] font-black uppercase tracking-widest text-foreground border border-border rounded-xl transition-all"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings');
                  }}
                >
                  <Settings className="h-4 w-4 text-primary" />
                  System Core Config
                </Button>
                <Button
                  variant="destructive"
                  className="w-full gap-3 h-12 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-danger/10 mt-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Terminate Session
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
