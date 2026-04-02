'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import axios from "axios";

export default function LoginHistoryTab() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'failed'>('all');
  const [failedIpCounts, setFailedIpCounts] = useState<Record<string, number>>({});

  const fetchHistory = async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (statusFilter === 'failed') params.set('status', 'failed');
      const response = await axios.get(`/api/admin/login-history?${params}`);
      if (response.data.success) {
        setHistory(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
        if (response.data.failedIpCounts) {
          setFailedIpCounts(response.data.failedIpCounts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, statusFilter]);

  const isSuspiciousIp = (ip: string | null) => {
    if (!ip) return false;
    return (failedIpCounts[ip] || 0) > 3;
  };

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between pb-6 space-y-0 border-b border-border">
        <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          Security Audit
        </CardTitle>
        <div className="flex items-center gap-3">
          {/* Filter Toggle */}
          <div className="flex bg-surface-muted/50 border border-border rounded-xl p-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                statusFilter === 'all'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                statusFilter === 'failed'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Failed Only
            </button>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-primary/5 hover:text-primary transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="bg-background border border-border px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Page <span className="text-primary">{page}</span> of {totalPages}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="h-10 w-10 p-0 rounded-xl border-border bg-background hover:bg-primary/5 hover:text-primary transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-surface-muted/30">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-6">Access Time</TableHead>
              <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Identity</TableHead>
              <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Origin IP</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pr-6">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" />
                </TableCell>
              </TableRow>
            ) : history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  {statusFilter === 'failed' ? 'No failed login attempts found.' : 'No login history found.'}
                </TableCell>
              </TableRow>
            ) : (
              history.map((item) => (
                <TableRow 
                  key={item.id} 
                  className={`border-b border-border/50 transition-colors group ${
                    item.status === 'failed' 
                      ? 'bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30' 
                      : 'hover:bg-primary/[0.02]'
                  }`}
                >
                  <TableCell className="text-[11px] font-bold text-muted-foreground pl-6">
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-extrabold text-[13px] text-foreground">
                    {item.user?.name || 'TERMINAL_01'}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                    <div className="flex items-center gap-1.5">
                      <span>{item.ipAddress || '—'}</span>
                      {isSuspiciousIp(item.ipAddress) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[9px] font-black uppercase tracking-wider border border-red-200 dark:border-red-800">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {failedIpCounts[item.ipAddress!]}×
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    {item.status === 'success' ? (
                      <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20 shadow-[0_0_10px_var(--primary)] shadow-primary/20 w-fit">
                        <ShieldCheck className="h-3 w-3" />
                        Authenticated
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-danger font-black text-[9px] uppercase tracking-widest bg-danger/10 px-3 py-1 rounded-full border border-danger/20 w-fit">
                        <ShieldAlert className="h-3 w-3" />
                        Denied
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
