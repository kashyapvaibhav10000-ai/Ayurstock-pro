'use client';

import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { toast } from "sonner"

export default function SystemSettings() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState({
    darkMode: false,
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
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-lg text-text-primary">System Preferences</h2>
          <p className="text-sm text-text-secondary mt-1">Manage global system configurations and sync tools.</p>
        </div>

        <div className="flex justify-between items-center py-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium text-text-primary">Dark Mode</h3>
            <p className="text-xs text-text-secondary">Switch the UI theme to dark</p>
          </div>
          <Switch
            checked={settings.darkMode}
            onCheckedChange={() => handleToggle("darkMode", "Dark Mode")}
          />
        </div>

        <div className="flex justify-between items-center py-2 border-t border-surface-border">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium text-text-primary">Enable Notifications</h3>
            <p className="text-xs text-text-secondary">Receive alerts for low stock and tasks</p>
          </div>
          <Switch
            checked={settings.enableNotifications}
            onCheckedChange={() => handleToggle("enableNotifications", "Notifications")}
          />
        </div>

        <div className="flex justify-between items-center py-2 border-t border-surface-border">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium text-text-primary">Enable Cloud Sync</h3>
            <p className="text-xs text-text-secondary">Automatically securely backup your data</p>
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
