'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import DashboardHeader from '@/components/DashboardHeader';
import { AuthUser } from '@/types';
import { AuthProvider } from '@/components/providers/AuthProvider';
import {
  LayoutDashboard,
  ReceiptText,
  Boxes,
  ClipboardList,
  Settings,
} from 'lucide-react';

const mobileNav = [
  { href: '/dashboard',            label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN','MANAGER','CASHIER'] },
  { href: '/dashboard/billing',    label: 'Billing',   icon: ReceiptText,     roles: ['ADMIN','MANAGER','CASHIER'] },
  { href: '/dashboard/inventory',  label: 'Inventory', icon: Boxes,           roles: ['ADMIN','MANAGER'] },
  { href: '/dashboard/reports',    label: 'Reports',   icon: ClipboardList,   roles: ['ADMIN','MANAGER'] },
  { href: '/dashboard/settings',   label: 'Settings',  icon: Settings,        roles: ['ADMIN'] },
];

export default function DashboardClientWrapper({
  children,
  user,
}: {
  children: React.ReactNode;
  user: AuthUser;
}) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  const visibleMobileNav = mobileNav.filter((item) => item.roles.includes(user.role));

  return (
    <AuthProvider user={user}>
      <div className="flex h-screen bg-background text-text-primary overflow-hidden">
        <Sidebar
          user={user}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DashboardHeader
            user={user}
            onMenuToggle={() => setIsMobileSidebarOpen(true)}
          />
          <div className="flex-1 overflow-auto pb-16 xl:pb-0 bg-background bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.04),_transparent_40%)]">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-surface-border flex items-stretch shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        {visibleMobileNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`}
            >
              <div className={`relative flex items-center justify-center h-8 w-8 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                <Icon className={`h-5 w-5 transition-all ${isActive ? 'text-primary scale-110' : 'text-text-muted'}`} />
              </div>
              <span className={`text-[10px] font-bold tracking-wide ${isActive ? 'text-primary' : 'text-text-muted'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </AuthProvider>
  );
}
