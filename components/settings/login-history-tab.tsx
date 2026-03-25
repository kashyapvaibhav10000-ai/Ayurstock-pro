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
import { Loader2, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";
import axios from "axios";

export default function LoginHistoryTab() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistory = async (p: number) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/login-history?page=${p}&limit=50`);
      if (response.data.success) {
        setHistory(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(page);
  }, [page]);

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
                  No login history found.
                </TableCell>
              </TableRow>
            ) : (
              history.map((item) => (
                <TableRow key={item.id} className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors group">
                  <TableCell className="text-[11px] font-bold text-muted-foreground pl-6">
                    {new Date(item.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-extrabold text-[13px] text-foreground">
                    {item.user?.name || 'TERMINAL_01'}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                    {item.ipAddress || '—'}
                  </TableCell>
                  <TableCell className="pr-6">
                    {item.status === 'success' ? (
                      <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20 shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                        <ShieldCheck className="h-3 w-3" />
                        Authenticated
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-danger font-black text-[9px] uppercase tracking-widest bg-danger/10 px-3 py-1 rounded-full border border-danger/20">
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
