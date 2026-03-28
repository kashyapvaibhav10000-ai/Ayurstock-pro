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
          <div className="flex-1 overflow-auto pb-16 xl:pb-0 bg-background bg-[radial-gradient(circle_at_top_left,_var(--primary),_transparent_40%)] shadow-primary/5">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl border-t border-border flex items-stretch shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
        {visibleMobileNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className={`relative flex items-center justify-center h-10 w-10 rounded-2xl transition-all duration-300 ${isActive ? 'bg-primary/20 shadow-[0_0_15px_var(--primary)] shadow-primary/20 border border-primary/20' : ''}`}>
                <Icon className={`h-5 w-5 transition-all duration-300 ${isActive ? 'text-primary scale-110 drop-shadow-[0_0_8px_var(--primary)] drop-shadow-primary/40' : 'text-muted-foreground'}`} />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-[0.15em] mt-1 ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </AuthProvider>
  );
}
