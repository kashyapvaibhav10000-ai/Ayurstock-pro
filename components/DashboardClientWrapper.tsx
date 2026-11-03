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
  { href: '/dashboard/billing',    label: 'New Sales', icon: ReceiptText,     roles: ['ADMIN','MANAGER','CASHIER'] },
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
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
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
          <div className="flex-1 overflow-auto pb-16 xl:pb-0 bg-background">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-separator flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {visibleMobileNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-200 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative flex items-center justify-center h-7 w-7">
                <Icon className={`h-[22px] w-[22px] stroke-[1.75] ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <span className={`text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </AuthProvider>
  );
}
