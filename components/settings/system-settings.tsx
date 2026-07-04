'use client';

import { Card, CardContent } from "@/components/ui/card"
import ThemeToggle from "@/components/ThemeToggle"

export default function SystemSettings() {
  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase">System Calibration</h2>
          <p className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">Global configurations and interface synchronization.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 py-4 border-t border-border mt-6">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">Appearance</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Light, dark, or follow your device automatically</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">System Notifications</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Real-time alerts for inventory and logistics</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider border border-amber-200">Coming Soon</span>
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">Cloud Synchronicity</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Automated secure archival of clinical records</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider border border-amber-200">Coming Soon</span>
        </div>
      </CardContent>
    </Card>
  )
}
