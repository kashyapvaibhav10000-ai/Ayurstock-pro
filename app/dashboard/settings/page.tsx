'use client';

import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ShopSettings from '@/components/settings/shop-settings';
import InvoiceSettings from '@/components/settings/invoice-settings';
import BillingSettings from '@/components/settings/billing-settings';
import InventorySettings from '@/components/settings/inventory-settings';
import UserSettings from '@/components/settings/user-settings';
import SystemSettings from '@/components/settings/system-settings';
import CompanySettings from '@/components/settings/company-settings';
import ProfileSettings from '@/components/settings/profile-settings';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'shop';

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

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure shop details, user access, billing rules, and system preferences.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Workspace Settings</CardTitle>
          <CardDescription>Everything important in one clean control center.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={initialTab} className="w-full space-y-6">
            <TabsList className="grid w-full rounded-2xl bg-slate-100 p-1 md:grid-cols-8">
              <TabsTrigger value="shop" className="rounded-xl">Shop Settings</TabsTrigger>
              <TabsTrigger value="invoice" className="rounded-xl">Invoice Settings</TabsTrigger>
              <TabsTrigger value="profile" className="rounded-xl">Profile Settings</TabsTrigger>
              <TabsTrigger value="users" className="rounded-xl">User Management</TabsTrigger>
              <TabsTrigger value="companies" className="rounded-xl">Company Management</TabsTrigger>
              <TabsTrigger value="billing" className="rounded-xl">Billing Settings</TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-xl">Inventory Settings</TabsTrigger>
              <TabsTrigger value="system" className="rounded-xl">System Preferences</TabsTrigger>
            </TabsList>

            <TabsContent value="shop">
              <ShopSettings />
            </TabsContent>
            <TabsContent value="invoice">
              <InvoiceSettings />
            </TabsContent>
            <TabsContent value="profile">
              <ProfileSettings />
            </TabsContent>
            <TabsContent value="users">
              <UserSettings />
            </TabsContent>
            <TabsContent value="companies">
              <CompanySettings />
            </TabsContent>
            <TabsContent value="billing">
              <BillingSettings />
            </TabsContent>
            <TabsContent value="inventory">
              <InventorySettings />
            </TabsContent>
            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-red-100 bg-red-50/70">
        <CardHeader>
          <CardTitle className="text-lg text-red-700">Session</CardTitle>
          <CardDescription>Logout is available here instead of the sidebar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
