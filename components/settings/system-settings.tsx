'use client';

import { Card, CardContent } from "@/components/ui/card"
import ThemeToggle from "@/components/ThemeToggle"

export default function SystemSettings() {
  return (
    <Card className="border-border bg-surface shadow-card">
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-title-2 text-foreground">Preferences</h2>
          <p className="text-callout text-muted-foreground mt-1">How the app looks and behaves on this device.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 py-4 border-t border-border mt-6">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-foreground">Appearance</h3>
            <p className="text-[13px] text-muted-foreground">Light or dark. In light mode, pick an accent colour.</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-foreground">System Notifications</h3>
            <p className="text-[11px] font-bold text-muted-foreground">Real-time alerts for inventory and logistics</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-warning/10 text-warning text-[11px] font-semibold border border-warning/30">Coming Soon</span>
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-foreground">Cloud Synchronicity</h3>
            <p className="text-[11px] font-bold text-muted-foreground">Automated secure archival of clinical records</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-warning/10 text-warning text-[11px] font-semibold border border-warning/30">Coming Soon</span>
        </div>
      </CardContent>
    </Card>
  )
}
