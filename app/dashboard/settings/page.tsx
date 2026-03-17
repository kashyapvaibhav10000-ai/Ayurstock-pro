'use client';

import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Store, FileText, User, Users, Building, CreditCard, Package, Settings as SettingsIcon } from 'lucide-react';
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
import { useState } from 'react';

const SETTINGS_CATEGORIES = [
  { id: 'shop', label: 'Shop Details', icon: Store, group: 'General' },
  { id: 'invoice', label: 'Invoices', icon: FileText, group: 'General' },
  { id: 'inventory', label: 'Inventory', icon: Package, group: 'General' },
  { id: 'profile', label: 'My Profile', icon: User, group: 'Account' },
  { id: 'users', label: 'Team', icon: Users, group: 'Account' },
  { id: 'companies', label: 'Suppliers', icon: Building, group: 'Billing' },
  { id: 'billing', label: 'Plans & Billing', icon: CreditCard, group: 'Billing' },
  { id: 'system', label: 'Preferences', icon: SettingsIcon, group: 'Advanced' },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'shop';
  
  const [activeTab, setActiveTab] = useState(initialTab);

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
      case 'profile': return <ProfileSettings />;
      case 'users': return <UserSettings />;
      case 'companies': return <CompanySettings />;
      case 'billing': return <BillingSettings />;
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

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0 flex flex-col gap-8">
          <nav className="flex flex-col space-y-1">
            {['General', 'Account', 'Billing', 'Advanced'].map(group => (
              <div key={group} className="mb-6 last:mb-0">
                <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {group}
                </h4>
                {SETTINGS_CATEGORIES.filter(c => c.group === group).map(category => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveTab(category.id)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        activeTab === category.id 
                          ? "bg-primary-light text-primary-hover"
                          : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {category.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

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
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 min-w-0">
          <Card className="rounded-2xl border-surface-border bg-surface">
            <CardContent className="p-6 md:p-8">
              {renderContent()}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
