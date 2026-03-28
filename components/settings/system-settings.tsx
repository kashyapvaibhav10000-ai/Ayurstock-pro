'use client';

import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

export default function SystemSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState({
    enableNotifications: true,
    enableCloudBackup: true,
  });

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('ayurstock_system_prefs');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleToggle = (key: keyof typeof settings, label: string) => {
    const newValue = !settings[key];
    const newSettings = {
      ...settings,
      [key]: newValue,
    };
    
    setSettings(newSettings);
    localStorage.setItem('ayurstock_system_prefs', JSON.stringify(newSettings));
    
    toast.success(`${label} turned ${newValue ? 'on' : 'off'}`);
  }

  // Prevent hydration mismatch
  if (!mounted) return null;

  return (
    <Card className="border-border bg-surface shadow-soft">
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-black text-foreground tracking-tight uppercase">System Calibration</h2>
          <p className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">Global configurations and interface synchronization.</p>
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border mt-6">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">Dark Mode Protocol</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Enable high-contrast 'Soft Black & Gold' interface</p>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={(checked) => {
              setTheme(checked ? 'dark' : 'light');
              toast.success(`Dark Mode turned ${checked ? 'on' : 'off'}`);
            }}
          />
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">System Notifications</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Real-time alerts for inventory and logistics</p>
          </div>
          <Switch
            checked={settings.enableNotifications}
            onCheckedChange={() => handleToggle("enableNotifications", "Notifications")}
          />
        </div>

        <div className="flex justify-between items-center py-4 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">Cloud Synchronicity</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Automated secure archival of clinical records</p>
          </div>
          <Switch
            checked={settings.enableCloudBackup}
            onCheckedChange={() => handleToggle("enableCloudBackup", "Cloud Sync")}
          />
        </div>
      </CardContent>
    </Card>
  )
}
