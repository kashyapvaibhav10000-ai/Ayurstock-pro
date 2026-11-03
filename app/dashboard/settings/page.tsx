'use client';

import axios from 'axios';
import { clearAccent } from '@/lib/accent';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut, Store, FileText, User, Users, Building, CreditCard, Package, Archive, Settings as SettingsIcon, UploadCloud, Database, Sparkles, ShieldCheck, BellRing, ReceiptText, History, MonitorSmartphone } from 'lucide-react';
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
import AiSettingsTab from '@/components/settings/ai-settings-tab';
import LoginHistoryTab from '@/components/settings/login-history-tab';
import ExpiryAlertSettings from '@/components/settings/expiry-alert-settings';
import GstCategorySettings from '@/components/settings/gst-category-settings';
import InventoryHistoryTab from '@/components/settings/inventory-history-tab';
import PurchaseHistoryTab from '@/components/settings/purchase-history-tab';
import PosDevicesSettings from '@/components/settings/pos-devices-settings';
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

const SETTINGS_CATEGORIES = [
  { id: 'shop', label: 'Shop Details', icon: Store, group: 'General' },
  { id: 'system', label: 'Preferences', icon: SettingsIcon, group: 'General' },
  { id: 'inventory', label: 'Inventory', icon: Package, group: 'General' },
  { id: 'inventory-history', label: 'Inventory History', icon: History, group: 'General' },
  { id: 'purchase-history', label: 'Purchase History', icon: ReceiptText, group: 'General' },
  { id: 'racks', label: 'Rack Locations', icon: Archive, group: 'General' },
  { id: 'companies', label: 'Company', icon: Building, group: 'General' },
  { id: 'expiry-alerts', label: 'Expiry Alerts', icon: BellRing, group: 'General' },
  { id: 'profile', label: 'My Profile', icon: User, group: 'Account' },
  { id: 'users', label: 'Team', icon: Users, group: 'Account' },
  { id: 'pos-devices', label: 'POS Devices', icon: MonitorSmartphone, group: 'Account' },
  { id: 'invoice', label: 'Invoices', icon: FileText, group: 'Billing' },
  { id: 'billing', label: 'Shop Configuration', icon: CreditCard, group: 'Billing' },
  { id: 'gst-categories', label: 'GST by Category', icon: ReceiptText, group: 'Billing' },
  { id: 'import', label: 'Bulk Import Data', icon: UploadCloud, group: 'Advanced' },
  { id: 'database', label: 'Database Admin', icon: Database, group: 'Advanced' },
  { id: 'activity', label: 'Activity Log', icon: FileText, group: 'Advanced' },
  // Super-admin only (filtered below; API enforces it too).
  { id: 'ai', label: 'AI', icon: Sparkles, group: 'Advanced', superAdminOnly: true },
  { id: 'login-history', label: 'Login History', icon: ShieldCheck, group: 'Advanced' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isAdmin, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/dashboard');
    }
  }, [isAdmin, router]);

  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'shop';
  
  const [activeTab, setActiveTab] = useState(initialTab);

  // Follow ?tab= when navigating within settings (e.g. history reference links).
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  if (!isAdmin) return null;

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      clearAccent();
      router.replace('/login');
      router.refresh();
    }
  };

  const renderContent = () => {
    switch(activeTab) {
      case 'shop': return <ShopSettings />;
      case 'invoice': return <InvoiceSettings />;
      case 'inventory': return <InventorySettings />;
      case 'inventory-history': return <InventoryHistoryTab />;
      case 'purchase-history': return <PurchaseHistoryTab />;
      case 'racks': return <RackLocationsSettings />;
      case 'profile': return <ProfileSettings />;
      case 'users': return <UserSettings />;
      case 'pos-devices': return <PosDevicesSettings />;
      case 'companies': return <CompanySettings />;
      case 'billing': return <BillingSettings />;
      case 'expiry-alerts': return <ExpiryAlertSettings />;
      case 'import': return <DataImportSettings />;
      case 'database': return <DatabaseAdmin />;
      case 'activity': return <ActivityLogTab />;
      case 'ai':
      case 'ai-usage':
        return isSuperAdmin ? <AiSettingsTab /> : <ShopSettings />;
      case 'login-history': return <LoginHistoryTab />;
      case 'system': return <SystemSettings />;
      case 'gst-categories': return <GstCategorySettings />;
      default: return <ShopSettings />;
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-large-title text-foreground">Settings</h1>
        <p className="mt-1 text-callout text-muted-foreground">
          Manage your shop, account and preferences.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-60 shrink-0 lg:sticky lg:top-6 lg:self-start">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 gap-2 lg:gap-5 no-scrollbar">
            {['General', 'Account', 'Billing', 'Advanced'].map(group => (
              <div key={group} className="flex lg:flex-col shrink-0 items-center lg:items-stretch gap-2 lg:gap-0">
                <h4 className="hidden lg:block mb-1.5 px-3 text-footnote font-semibold text-muted-foreground">
                  {group}
                </h4>
                <div className="flex lg:flex-col gap-2 lg:gap-0.5 lg:rounded-card lg:bg-surface lg:p-1.5 lg:shadow-card">
                {SETTINGS_CATEGORIES.filter(c => c.group === group && (!('superAdminOnly' in c) || isSuperAdmin)).map(category => {
                  const Icon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveTab(category.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-full lg:rounded-[10px] px-4 py-2 lg:px-2.5 lg:py-[7px] text-[13px] font-medium transition-colors duration-200 whitespace-nowrap",
                        activeTab === category.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface lg:bg-transparent text-foreground hover:bg-surface-muted"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0 stroke-[1.75]", activeTab === category.id ? "text-primary-foreground" : "text-muted-foreground")} />
                      {category.label}
                    </button>
                  );
                })}
                </div>
                {/* Visual separator for mobile */}
                <div className="lg:hidden w-px h-4 bg-border mx-2 last:hidden" />
              </div>
            ))}
          </nav>

          <div className="hidden lg:block mt-5 rounded-card bg-surface p-1.5 shadow-card">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] font-medium text-danger transition-colors duration-200 hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4 stroke-[1.75]" />
              Log out
            </button>
          </div>
        </aside>

        {/* Dynamic Content Area */}
        <main className="flex-1 min-w-0">
          <Card>
            <CardContent className="p-4 md:p-8">
              {renderContent()}
              
              <div className="lg:hidden mt-8 pt-8 border-t border-border">
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
