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
import { Loader2, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import axios from "axios";

export default function ActivityLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/activity-log?page=${p}&limit=50`);
      if (response.data.success) {
        setLogs(response.data.data);
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between pb-6 space-y-0 border-b border-border">
        <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          Audit Trail
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
              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-6">Date / Time</TableHead>
              <TableHead className="w-[150px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Officer</TableHead>
              <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Operation</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pr-6">Data Trace</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                  No activity logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-b border-border/50 hover:bg-primary/[0.02] transition-colors group">
                  <TableCell className="text-[11px] font-bold text-muted-foreground whitespace-nowrap pl-6">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-extrabold text-[13px] text-foreground">
                    {log.user?.name || 'SYSTEM_CORE'}
                  </TableCell>
                  <TableCell>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/20">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground/60 pr-6 break-all">
                    {log.meta ? log.meta : '—'}
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
