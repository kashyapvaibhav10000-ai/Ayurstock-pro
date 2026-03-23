'use client';

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import axios from "axios"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"

export default function SystemSettings() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState({
    darkMode: false,
    enableNotifications: true,
    enableCloudBackup: true,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const handleClearAll = async () => {
    setIsDeleting(true);
    try {
      const response = await axios.delete('/api/medicines/clear-all');
      if (response.data.success) {
        toast.success("All medicines and related data have been cleared.");
        setIsDialogOpen(false);
      } else {
        toast.error(response.data.message || "Failed to clear medicines.");
      }
    } catch (error: any) {
      console.error("Clear all failed:", error);
      toast.error(error.response?.data?.message || "An error occurred while clearing data.");
    } finally {
      setIsDeleting(false);
    }
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

        <div className="mt-8 pt-6 border-t border-danger/20">
          <div className="bg-danger-bg/20 rounded-xl border border-danger/20 p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-danger-bg rounded-lg">
                <AlertTriangle className="h-5 w-5 text-danger-text" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-bold text-danger-text">Danger Zone</h3>
                <p className="text-xs text-danger-text/80">
                  Permanently delete all medicines, inventory batches, and sales records. This action cannot be undone.
                </p>
              </div>
            </div>
            
            <div className="mt-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="gap-2 h-9">
                    <Trash2 className="h-4 w-4" />
                    Clear All Medicines
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-danger-text">
                      <AlertTriangle className="h-5 w-5" />
                      Extremely Dangerous Action
                    </DialogTitle>
                    <DialogDescription className="pt-2">
                      This will permanently delete:
                      <ul className="list-disc list-inside mt-2 space-y-1 font-medium text-text-primary">
                        <li>All Medicines in Master Data</li>
                        <li>All Inventory Batches & Stock</li>
                        <li>All Sales & Purchase Records</li>
                        <li>All Ledger Entries</li>
                      </ul>
                      <p className="mt-4 font-bold text-danger-text uppercase text-xs tracking-widest">
                        Type "CONFIRM" to proceed with deletion
                      </p>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <p className="text-sm text-text-secondary italic">
                      Are you absolutely sure? This action is irreversible.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleClearAll} 
                      disabled={isDeleting}
                      className="gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Yes, Delete Everything
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
