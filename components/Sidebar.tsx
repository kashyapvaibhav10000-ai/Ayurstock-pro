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
  X,
  RotateCcw,
  History,
  IndianRupee,
  Pin,
  PinOff,
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
  { href: '/dashboard',              label: 'Dashboard',    icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/billing',      label: 'Billing',      icon: ReceiptText,     roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/medicines',    label: 'Medicines',    icon: Pill,            roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/inventory',    label: 'Inventory',    icon: Boxes,           roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/returns',      label: 'Returns',      icon: RotateCcw,       roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/purchases',    label: 'Purchases',    icon: ShoppingCart,    roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/sales-history',label: 'Sales History',icon: History,         roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/credits',      label: 'Credits',      icon: IndianRupee,     roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/suppliers',    label: 'Suppliers',    icon: PackageSearch,   roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/reports',      label: 'Reports',      icon: ClipboardList,   roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/settings',     label: 'Settings',     icon: Settings,        roles: ['ADMIN'] },
];

export default function Sidebar({ user, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = isPinned || isHovered || isMobileOpen;
  const visibleItems = menuItems.filter((item) => item.roles.includes(user.role));

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm xl:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          border-r border-surface-border bg-white shadow-bento
          transition-all duration-250 ease-in-out
          xl:static xl:shadow-none xl:translate-x-0
          ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full xl:translate-x-0'}
          ${isExpanded ? 'xl:w-[220px]' : 'xl:w-[68px]'}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-4 h-[65px] overflow-hidden">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
              <Image src="/logo.png" width={22} height={22} alt="AyurStock Pro" />
            </div>
            {isExpanded && (
              <div className="overflow-hidden transition-all duration-200">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary whitespace-nowrap">
                  AyurStock Pro
                </p>
                <p className="text-xs font-semibold text-text-primary whitespace-nowrap mt-0.5">
                  Pharmacy
                </p>
              </div>
            )}
          </div>

          {/* Mobile close */}
          <Button variant="ghost" size="icon" className="xl:hidden h-8 w-8 rounded-lg shrink-0" onClick={onMobileClose}>
            <X className="h-4 w-4" />
          </Button>

          {/* Desktop pin toggle */}
          {isExpanded && (
            <button
              onClick={() => setIsPinned((p) => !p)}
              className="hidden xl:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
              title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* User pill */}
        <div className={`px-3 py-3 border-b border-surface-border overflow-hidden`}>
          <div className={`flex items-center gap-3 rounded-xl bg-surface-muted px-2.5 py-2 ${!isExpanded ? 'justify-center px-0 bg-transparent' : ''}`}>
            <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover rounded-lg" />
                : user.name.slice(0, 2).toUpperCase()
              }
            </div>
            {isExpanded && (
              <div className="min-w-0 overflow-hidden">
                <p className="text-xs font-bold text-text-primary truncate leading-tight">{user.name}</p>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mt-0.5">{user.role}</p>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5 no-scrollbar">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1280) onMobileClose();
                }}
                title={!isExpanded ? item.label : undefined}
                className={`
                  group relative flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-all duration-150
                  ${isExpanded ? '' : 'xl:justify-center'}
                  ${isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                  }
                `}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                )}

                <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110 ${isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-primary'}`} />

                {isExpanded && (
                  <span className="whitespace-nowrap overflow-hidden transition-all duration-200">
                    {item.label}
                  </span>
                )}

                {/* Tooltip on collapsed desktop */}
                {!isExpanded && (
                  <span className="pointer-events-none absolute left-full ml-2 hidden xl:block whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-50">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom spacer for mobile (above bottom nav) */}
        <div className="h-2" />
      </aside>
    </>
  );
}
