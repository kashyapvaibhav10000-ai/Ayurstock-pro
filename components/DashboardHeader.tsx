'use client';

import { useEffect, useMemo, useState } from 'react';
import { clearAccent } from '@/lib/accent';
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
      clearAccent();
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 sm:px-6 h-[60px] shrink-0 relative z-20">
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
            <Image src="/logo.png" width={28} height={28} alt="AyurStock Pro" className="w-7 h-7 rounded-lg" />
          </div>
          <span className="text-[17px] sm:text-[19px] font-semibold tracking-[-0.015em] text-foreground truncate">{pageTitle}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {pathname !== '/dashboard/billing' && (
            <div className="relative hidden md:block w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.75] text-muted-foreground" />
              <Input placeholder="Search" className="h-9 rounded-full pl-9 text-[14px]" />
            </div>
          )}

          {/* Theme toggle: available to every role (Admin, Manager, Cashier), on every
              device including mobile — this is the fix for the "stuck theme" bug. */}
          <ThemeToggle />

          <Button variant="ghost" size="icon" aria-label="Notifications" className="hidden sm:flex h-9 w-9 text-muted-foreground hover:text-foreground">
            <Bell className="h-[18px] w-[18px] stroke-[1.75]" />
          </Button>
          
          <button
            className="group flex items-center gap-2 rounded-full p-0.5 sm:pr-3 transition-colors duration-200 hover:bg-fill focus:outline-none"
            onClick={() => setProfileOpen(true)}
          >
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[12px] font-semibold text-primary">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-[13px] font-semibold text-foreground leading-tight">{user.name}</div>
              <div className="text-[11px] text-muted-foreground capitalize">{user.role.toLowerCase()}</div>
            </div>
          </button>
        </div>
      </header>

      {/* Slide-over Profile Panel */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Overlay */}
          <div 
            className="absolute inset-0 bg-[var(--scrim)] transition-opacity"
            onClick={() => setProfileOpen(false)}
          />
          
          {/* Panel */}
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-sm transform transition-all shadow-pop bg-surface h-full flex flex-col border-l border-border">
              
              {/* Panel Header */}
              <div className="flex items-center justify-between px-6 h-[60px] border-b border-border">
                <h2 className="text-headline text-foreground flex items-center gap-2">
                  <UserCircle className="h-5 w-5 stroke-[1.75] text-muted-foreground" />
                  Account
                </h2>
                <button aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-muted-foreground hover:bg-fill-strong hover:text-foreground transition-colors" onClick={() => setProfileOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Panel Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* User Info Segment */}
                <div className="flex flex-col items-center text-center pt-2">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-2xl font-semibold text-primary shrink-0">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      user.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 mt-3">
                    <p className="text-title-3 text-foreground truncate">{user.name}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5 capitalize">{user.role.toLowerCase()}</p>
                  </div>
                </div>

                {/* Shop Info Segment */}
                <div>
                  <h3 className="text-footnote font-medium text-muted-foreground mb-2 px-1">Shop</h3>
                  {shopInfo ? (
                    <div className="rounded-xl bg-fill divide-y divide-border">
                      <div className="flex gap-3 items-start px-4 py-3">
                        <Building2 className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[14px] font-semibold text-foreground">{shopInfo.shopName}</p>
                          <p className="text-[13px] text-muted-foreground mt-0.5">{shopInfo.addressLine1}</p>
                          {shopInfo.addressLine2 && <p className="text-[13px] text-muted-foreground">{shopInfo.addressLine2}</p>}
                        </div>
                      </div>

                      <div className="flex gap-3 items-center px-4 py-3">
                        <Phone className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground shrink-0" />
                        <p className="text-[14px] text-foreground">{shopInfo.phone || <span className="text-muted-foreground">No phone added</span>}</p>
                      </div>

                      <div className="flex gap-3 items-center px-4 py-3">
                        <Mail className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground shrink-0" />
                        <p className="text-[14px] text-foreground truncate">{shopInfo.email || <span className="text-muted-foreground">No email added</span>}</p>
                      </div>

                      <div className="flex gap-3 items-center px-4 py-3">
                        <FileText className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground shrink-0" />
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <p className="text-[14px] text-foreground">GSTIN</p>
                          <p className="text-[13px] font-mono text-muted-foreground">{shopInfo.gstin || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13px] text-muted-foreground flex items-center gap-2 py-4 px-1">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-fill-strong border-t-primary"></span>
                      Loading shop details…
                    </div>
                  )}
                </div>

              </div>
              
              {/* Panel Footer Actions */}
              <div className="p-4 border-t border-border space-y-1">
                <Button
                  variant="ghost"
                  className="w-full gap-3 justify-start h-10 text-[14px] font-medium text-foreground rounded-[10px]"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings?tab=shop');
                  }}
                >
                  <Store className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground" />
                  Edit shop details
                </Button>
                <Button
                  variant="ghost"
                  className="w-full gap-3 justify-start h-10 text-[14px] font-medium text-foreground rounded-[10px]"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/dashboard/settings');
                  }}
                >
                  <Settings className="h-[18px] w-[18px] stroke-[1.75] text-muted-foreground" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  className="w-full gap-3 justify-start h-10 text-[14px] font-medium text-danger rounded-[10px] hover:bg-danger/10 hover:text-danger"
                  onClick={handleLogout}
                >
                  <LogOut className="h-[18px] w-[18px] stroke-[1.75]" />
                  Log out
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
