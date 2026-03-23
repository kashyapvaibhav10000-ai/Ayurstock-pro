'use client';

import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Store, FileText, User, Users, Building, CreditCard, Package, Archive, Settings as SettingsIcon, UploadCloud, Database, Sparkles, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ShopSettings from '@/components/settings/shop-settings';
import InvoiceSettings from '@/components/settings/invoice-settings';
import BillingSettings from '@/components/settings/billing-settings';
import InventorySettings from '@/components/settings/inventory-settings';
import UserSettings from '@/components/settings/user-settings';
import SystemSettings from '@/components/settings/system-settings';
import CompanySettings from '@/components/settings/company-settings';
import ProfileSettings from '@/components/settings/profile-settings';
import RackLocationsSettings from '@/components/settings/rack-locations-settings';
import DataImportSettings from '@/components/settings/data-import-settings';
import DatabaseAdmin from '@/components/settings/database-admin';
import ActivityLogTab from '@/components/settings/activity-log-tab';
import AiUsageTab from '@/components/settings/ai-usage-tab';
import LoginHistoryTab from '@/components/settings/login-history-tab';
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

const SETTINGS_CATEGORIES = [
  { id: 'shop', label: 'Shop Details', icon: Store, group: 'General' },
  { id: 'invoice', label: 'Invoices', icon: FileText, group: 'General' },
  { id: 'inventory', label: 'Inventory', icon: Package, group: 'General' },
  { id: 'racks', label: 'Rack Locations', icon: Archive, group: 'General' },
  { id: 'profile', label: 'My Profile', icon: User, group: 'Account' },
  { id: 'users', label: 'Team', icon: Users, group: 'Account' },
  { id: 'companies', label: 'Suppliers', icon: Building, group: 'Billing' },
  { id: 'billing', label: 'Plans & Billing', icon: CreditCard, group: 'Billing' },
  { id: 'import', label: 'Bulk Import Data', icon: UploadCloud, group: 'Advanced' },
  { id: 'database', label: 'Database Admin', icon: Database, group: 'Advanced' },
  { id: 'activity', label: 'Activity Log', icon: FileText, group: 'Advanced' },
  { id: 'ai-usage', label: 'AI Usage', icon: Sparkles, group: 'Advanced' },
  { id: 'login-history', label: 'Login History', icon: ShieldCheck, group: 'Advanced' },
  { id: 'system', label: 'Preferences', icon: SettingsIcon, group: 'Advanced' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard');
    }
  }, [isAdmin, router]);

  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'shop';
  
  const [activeTab, setActiveTab] = useState(initialTab);

  if (!isAdmin) return null;

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

  const renderContent = () => {
    switch(activeTab) {
      case 'shop': return <ShopSettings />;
      case 'invoice': return <InvoiceSettings />;
      case 'inventory': return <InventorySettings />;
      case 'racks': return <RackLocationsSettings />;
      case 'profile': return <ProfileSettings />;
      case 'users': return <UserSettings />;
      case 'companies': return <CompanySettings />;
      case 'billing': return <BillingSettings />;
      case 'import': return <DataImportSettings />;
      case 'database': return <DatabaseAdmin />;
      case 'activity': return <ActivityLogTab />;
      case 'ai-usage': return <AiUsageTab />;
      case 'login-history': return <LoginHistoryTab />;
      case 'system': return <SystemSettings />;
      default: return <ShopSettings />;
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage your account settings and set preferences.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 gap-2 lg:gap-1 scrollbar-hide no-scrollbar">
            {['General', 'Account', 'Billing', 'Advanced'].map(group => (
              <div key={group} className="flex lg:flex-col shrink-0 lg:mb-6 last:mb-0 items-center lg:items-stretch gap-2 lg:gap-0">
                <h4 className="hidden lg:block mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {group}
                </h4>
                {SETTINGS_CATEGORIES.filter(c => c.group === group).map(category => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveTab(category.id)}
                      className={cn(
                        "flex items-center gap-2 lg:gap-3 rounded-xl lg:rounded-lg px-4 py-2 lg:px-3 lg:py-2 text-sm font-medium transition-all whitespace-nowrap",
                        activeTab === category.id 
                          ? "bg-primary-light text-primary-hover shadow-sm lg:shadow-none"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary border border-transparent lg:border-none"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {category.label}
                    </button>
                  );
                })}
                {/* Visual separator for mobile */}
                <div className="lg:hidden w-px h-4 bg-surface-border mx-2 last:hidden" />
              </div>
            ))}
          </nav>

          <div className="hidden lg:block mt-8">
            <Card className="border-danger/20 bg-danger-bg shadow-none rounded-xl">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold text-danger-text">Session</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Button 
                  variant="destructive" 
                  className="w-full justify-start gap-2 h-9 px-3" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 min-w-0">
          <Card className="rounded-2xl border-surface-border bg-surface">
            <CardContent className="p-4 md:p-8">
              {renderContent()}
              
              <div className="lg:hidden mt-8 pt-8 border-t border-surface-border">
                <Button 
                  variant="destructive" 
                  className="w-full justify-center gap-2 h-11" 
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
