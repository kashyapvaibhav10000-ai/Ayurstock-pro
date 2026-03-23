'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  PackageSearch,
  Pill,
  ReceiptText,
  Settings,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  History,
} from 'lucide-react';
import Image from 'next/image';
import { AuthUser } from '@/types';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  user: AuthUser;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/billing', label: 'Billing', icon: ReceiptText, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/medicines', label: 'Medicines', icon: Pill, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/returns', label: 'Returns', icon: RotateCcw, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/purchases', label: 'Purchases', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/sales-history', label: 'Sales History', icon: History, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/suppliers', label: 'Suppliers', icon: PackageSearch, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/reports', label: 'Reports', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export default function Sidebar({ user, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [isDesktopOpen, setIsDesktopOpen] = useState(true);

  const visibleItems = menuItems.filter((item) => item.roles.includes(user.role));

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-in-out
    xl:static xl:translate-x-0 xl:shadow-none
    ${isDesktopOpen ? 'xl:w-72' : 'xl:w-24'}
    ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72 xl:w-min'}
  `;

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 xl:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside className={sidebarClasses}>
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-5 h-[81px]">
          <div className={`overflow-hidden transition-all ${isDesktopOpen || isMobileOpen ? 'w-auto opacity-100' : 'w-0 opacity-0 hidden xl:block'}`}>
            <div className="flex items-center gap-3">
              <Image src="/logo.png" width={40} height={40} alt="AyurStock Pro" className="w-[40px] h-[40px] shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  AyurStock Pro
                </span>
                <span className="mt-0.5 text-sm font-bold text-text-primary whitespace-nowrap">
                  Pharmacy
                </span>
              </div>
            </div>
          </div>
          
          {/* Desktop Toggle Button */}
          <button
            onClick={() => setIsDesktopOpen((current) => !current)}
            className="hidden xl:flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface text-text-secondary shadow-sm hover:bg-surface-muted transition"
          >
            {isDesktopOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {/* Mobile Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden h-8 w-8 rounded-lg"
            onClick={onMobileClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-4 py-4">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white shadow-sm overflow-hidden flex items-center justify-center xl:justify-start">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/20 text-sm font-semibold text-primary-light">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover rounded-[10px]" />
                ) : (
                  user.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className={`transition-all whitespace-nowrap ${isDesktopOpen || isMobileOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
                <div className="text-sm font-semibold truncate max-w-[130px]">{user.name}</div>
                <div className="text-xs text-slate-300">{user.role}</div>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 scrollbar-thin scrollbar-thumb-surface-border">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1280) {
                    onMobileClose();
                  }
                }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-light text-primary-hover shadow-sm'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                } ${!isDesktopOpen && !isMobileOpen ? 'xl:justify-center' : ''}`}
                title={item.label}
              >
                <Icon className={`shrink-0 ${isActive ? 'text-primary' : ''} ${!isDesktopOpen && !isMobileOpen ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`} />
                <span className={`whitespace-nowrap ${isDesktopOpen || isMobileOpen ? 'block' : 'hidden'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
