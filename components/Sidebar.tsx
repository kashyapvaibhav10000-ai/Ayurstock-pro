'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useMemo } from 'react';
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

const menuGroups = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CASHIER'] }
    ]
  },
  {
    label: 'Sales',
    items: [
      { href: '/dashboard/billing', label: 'Billing', icon: ReceiptText, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
      { href: '/dashboard/sales-history', label: 'Sales History', icon: History, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/credits', label: 'Credits', icon: IndianRupee, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/reports', label: 'Reports', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: PackageSearch, roles: ['ADMIN', 'MANAGER'] },
    ]
  },
  {
    label: 'Logistics',
    items: [
      { href: '/dashboard/medicines', label: 'Medicines', icon: Pill, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/returns', label: 'Returns', icon: RotateCcw, roles: ['ADMIN', 'MANAGER'] },
      { href: '/dashboard/purchases', label: 'Purchases', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER'] },
    ]
  },
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    ]
  }
];

export default function Sidebar({ user, isMobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = isPinned || isHovered || isMobileOpen;

  // Filter groups based on user roles
  const visibleGroups = useMemo(() => {
    return menuGroups.map(group => ({
      ...group,
      items: group.items.filter(item => item.roles.includes(user.role))
    })).filter(group => group.items.length > 0);
  }, [user.role]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm xl:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          border-r border-stitch-surfaceLow bg-stitch-surfaceLowest shadow-[4px_0_24px_rgba(43,53,47,0.03)]
          transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          xl:static xl:shadow-none xl:translate-x-0
          ${isMobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full xl:translate-x-0'}
          ${isExpanded ? 'xl:w-[240px]' : 'xl:w-[72px]'}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-5 h-[72px] overflow-hidden shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-[12px] bg-gradient-to-br from-stitch-primary to-stitch-primaryDim shadow-[0_4px_12px_rgba(0,109,79,0.15)] flex items-center justify-center">
              <Image src="/logo.png" width={24} height={24} alt="AyurStock Pro" className="brightness-0 invert opacity-90" />
            </div>
            {isExpanded && (
              <div className="overflow-hidden transition-all duration-300 opacity-100 whitespace-nowrap">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stitch-primary">
                  AyurStock Pro
                </p>
                <p className="text-[13px] font-bold text-stitch-onSurface mt-0.5">
                  Command Center
                </p>
              </div>
            )}
          </div>

          {/* Mobile close */}
          <Button variant="ghost" size="icon" className="xl:hidden h-8 w-8 rounded-lg shrink-0 text-stitch-onSurfaceVariant hover:bg-stitch-surfaceLow" onClick={onMobileClose}>
            <X className="h-4 w-4" />
          </Button>

          {/* Desktop pin toggle */}
          {isExpanded && (
            <button
              onClick={() => setIsPinned((p) => !p)}
              className="hidden xl:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stitch-outlineVariant hover:text-stitch-primary hover:bg-stitch-primaryContainer/30 transition-colors"
              title={isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* User pill */}
        <div className="px-3 pb-2 pt-1 shrink-0">
          <div className={`flex items-center gap-3 rounded-[14px] bg-stitch-surfaceLow px-2.5 py-2.5 transition-all duration-200 ${!isExpanded ? 'justify-center px-0 bg-transparent' : ''}`}>
            <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-[10px] bg-stitch-primaryContainer/50 text-xs font-bold text-stitch-primary">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover rounded-[10px]" />
                : user.name.slice(0, 2).toUpperCase()
              }
            </div>
            {isExpanded && (
              <div className="min-w-0 overflow-hidden">
                <p className="text-[12px] font-extrabold text-stitch-onSurface truncate leading-tight">{user.name}</p>
                <p className="text-[10px] font-semibold text-stitch-onSurfaceVariant uppercase tracking-wider mt-0.5">{user.role}</p>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Nav Items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-6 space-y-6 no-scrollbar">
          {visibleGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="flex flex-col">
              {/* Group Title Box */}
              <div className={`flex items-center h-6 mb-1 overflow-hidden transition-all duration-300 ${!isExpanded ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <span className="text-[10px] font-bold text-stitch-outlineVariant uppercase tracking-[0.15em] pl-3 whitespace-nowrap">
                  {group.label}
                </span>
              </div>
              
              <div className="space-y-1">
                {group.items.map((item) => {
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
                        group relative flex items-center gap-3.5 rounded-[12px] px-3 py-2.5 text-[13px] font-semibold transition-all duration-200
                        ${isExpanded ? '' : 'xl:justify-center px-0 mx-1 w-12 h-12 flex items-center justify-center'}
                        ${isActive
                          ? 'bg-stitch-primaryContainer/30 text-stitch-primary shadow-[inset_2px_0_0_#006d4f]'
                          : 'text-stitch-onSurfaceVariant hover:bg-stitch-surfaceLow hover:text-stitch-onSurface'
                        }
                      `}
                    >
                      {/* Active indicator bar (mobile + expanded desktop) */}
                      {isActive && isExpanded && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-stitch-primary" />
                      )}

                      <Icon 
                        className={`shrink-0 transition-transform duration-200 
                          ${isExpanded ? 'w-[18px] h-[18px]' : 'w-5 h-5 group-hover:scale-110'}
                          ${isActive ? 'text-stitch-primary drop-shadow-[0_2px_4px_rgba(0,109,79,0.2)]' : 'text-stitch-outlineVariant group-hover:text-stitch-primaryDim'}
                        `} 
                      />

                      {isExpanded && (
                        <span className="whitespace-nowrap overflow-hidden transition-all duration-200 truncate pr-2">
                          {item.label}
                        </span>
                      )}

                      {/* Tooltip on collapsed desktop */}
                      {!isExpanded && (
                        <span className="pointer-events-none absolute left-full ml-3 hidden xl:block whitespace-nowrap rounded-[8px] bg-stitch-onSurface px-3 py-2 text-[11px] font-bold tracking-wide text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl z-50">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom spacer for mobile bottom-nav */}
        <div className="h-16 xl:hidden shrink-0" />
      </aside>
    </>
  );
}
