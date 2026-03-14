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
} from 'lucide-react';
import { AuthUser } from '@/types';

interface SidebarProps {
  user: AuthUser;
}

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/billing', label: 'Billing', icon: ReceiptText, roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { href: '/dashboard/medicines', label: 'Medicines', icon: Pill, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/purchases', label: 'Purchases', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/suppliers', label: 'Suppliers', icon: PackageSearch, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/reports', label: 'Reports', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'] },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const visibleItems = menuItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside
      className={`hidden border-r border-white/60 bg-white/70 backdrop-blur xl:flex xl:flex-col ${
        isOpen ? 'w-72' : 'w-24'
      } transition-all duration-300`}
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-5">
        <div className={`overflow-hidden transition-all ${isOpen ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
            AyurStock Pro
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Pharmacy Workspace</div>
        </div>
        <button
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-2xl bg-slate-900 px-4 py-4 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500/20 text-sm font-semibold text-emerald-200">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.slice(0, 2).toUpperCase()
              )}
            </div>
            {isOpen ? (
              <div>
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-xs text-slate-300">{user.role}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 pb-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
              title={item.label}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {isOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
