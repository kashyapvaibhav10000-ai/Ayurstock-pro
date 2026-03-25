'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import axios from 'axios';
import { toast } from 'sonner';
import { IndianRupee, Phone, User, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface CreditSale {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  creditDue: number;
  createdAt: string;
}

interface CustomerCredit {
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalDue: number;
  sales: CreditSale[];
}

export default function CreditsPage() {
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAuthorized = hasRole(['ADMIN', 'MANAGER']);

  const [credits, setCredits] = useState<CustomerCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthorized) router.replace('/dashboard');
  }, [isAuthorized, router]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/credits');
      if (res.data.success) setCredits(res.data.data);
    } catch {
      toast.error('Failed to load credit data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markSalePaid = async (saleId: string) => {
    setPaying(saleId);
    try {
      const res = await axios.patch('/api/credits', { saleId });
      if (res.data.success) {
        toast.success('Payment recorded');
        await load();
      }
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setPaying(null);
    }
  };

  const totalOutstanding = credits.reduce((sum, c) => sum + c.totalDue, 0);

  if (!isAuthorized) return null;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading credit data...</div>;
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Credit Tracking</h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Customers with outstanding credit balances.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">
                ₹{totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customers with Credit</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{credits.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {credits.length === 0 ? (
        <Card className="rounded-[24px] border-border bg-surface shadow-soft border-l-[6px] border-l-primary/30">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <h3 className="text-lg font-extrabold text-foreground">All Clear!</h3>
            <p className="text-sm font-medium text-muted-foreground">No outstanding credit balances.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {credits.map((customer) => (
            <Card key={customer.customerId} className="overflow-hidden rounded-[24px] border-border bg-surface shadow-soft">
              <CardHeader
                className="cursor-pointer select-none py-4 px-5 hover:bg-primary/5 transition-colors"
                onClick={() => toggleExpand(customer.customerId)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {customer.customerName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-extrabold text-foreground truncate">{customer.customerName}</CardTitle>
                      {customer.customerPhone && (
                        <CardDescription className="flex items-center gap-1 text-xs mt-0.5 font-bold text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.customerPhone}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Due</p>
                      <p className="text-lg font-extrabold text-primary">
                        ₹{customer.totalDue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    {expanded.has(customer.customerId)
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </div>
              </CardHeader>

              {expanded.has(customer.customerId) && (
                <CardContent className="px-5 pb-4 pt-0">
                  <div className="border-t border-border pt-4 space-y-2">
                    {customer.sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-surface-muted/30 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">{sale.invoiceNumber}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                            {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                            {' · '}Bill: ₹{sale.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <span className="text-sm font-extrabold text-primary">
                            ₹{sale.creditDue.toLocaleString('en-IN', { maximumFractionDigits: 2 })} due
                          </span>
                          <Button
                            size="sm"
                            className="h-8 rounded-lg gap-1.5 font-bold bg-primary hover:bg-primary/90 text-background"
                            disabled={paying === sale.id}
                            onClick={() => markSalePaid(sale.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Paid
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
