'use client';

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import DashboardHeader from '@/components/DashboardHeader';
import { AuthUser } from '@/types';

import { AuthProvider } from '@/components/providers/AuthProvider';

export default function DashboardClientWrapper({
  children,
  user
}: {
  children: React.ReactNode;
  user: AuthUser;
}) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <AuthProvider user={user}>
      <div className="flex h-screen bg-surface-muted text-text-primary overflow-hidden">
        <Sidebar 
          user={user} 
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        <main className="flex-1 flex flex-col min-w-0">
          <DashboardHeader 
            user={user} 
            onMenuToggle={() => setIsMobileSidebarOpen(true)}
          />
          <div className="flex-1 overflow-auto bg-surface-bg bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.03),_transparent_35%)] rounded-tl-xl border-l border-t border-surface-border">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
