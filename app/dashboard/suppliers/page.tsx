'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Building2, Plus, Search, Phone, Mail, MapPin, ExternalLink, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function SuppliersPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace('/dashboard');
    }
  }, [isAuthorized, router]);

  const [searchQuery, setSearchQuery] = useState('');

  if (!isAuthorized) return null;

  return (
    <div className="space-y-6 md:space-y-8 p-4 md:p-8 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text-primary">Suppliers & Distributors</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your network of medicine suppliers and distributors.
          </p>
        </div>
        <Button className="gap-2 px-6">
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </header>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-surface p-4 rounded-2xl border border-surface-border shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input 
            placeholder="Search suppliers by name or city..." 
            className="pl-10 h-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" className="gap-2 rounded-xl flex-1 md:flex-none">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl flex-1 md:flex-none">
            Export CSV
          </Button>
        </div>
      </div>

      {/* Empty State / Coming Soon */}
      <Card className="rounded-2xl border-surface-border min-h-[400px] flex items-center justify-center bg-surface-muted">
        <CardContent className="flex flex-col items-center text-center p-12">
          <div className="h-16 w-16 bg-surface rounded-2xl flex items-center justify-center border border-surface-border shadow-sm mb-6 text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-semibold text-text-primary">No suppliers found</h3>
          <p className="text-sm text-text-secondary mt-2 max-w-sm mb-8">
            Start building your supplier database to track purchases, manage returns, and simplify your procurement workflow.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
            <div className="p-4 bg-surface border border-surface-border rounded-xl text-left">
              <Phone className="h-5 w-5 text-primary mb-2" />
              <div className="text-sm font-semibold">Contact Management</div>
              <p className="text-xs text-text-muted mt-1">Keep track of sales reps and dispatch contacts.</p>
            </div>
            <div className="p-4 bg-surface border border-surface-border rounded-xl text-left">
              <ExternalLink className="h-5 w-5 text-primary mb-2" />
              <div className="text-sm font-semibold">Purchase History</div>
              <p className="text-xs text-text-muted mt-1">See all invoices and payments for each distributor.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
