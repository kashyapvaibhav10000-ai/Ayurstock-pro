"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";

export default function ExpiryAlertSettings() {
  const [settings, setSettings] = useState({
    enableWhatsApp: true,
    enableEmail: true,
    whatsappNumber: "",
    emailAddress: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        const response = await axios.get("/api/settings/expiry-alerts");
        if (response.data.success && mounted) {
          setSettings({
            enableWhatsApp: response.data.data.enableWhatsApp,
            enableEmail: response.data.data.enableEmail,
            whatsappNumber: response.data.data.whatsappNumber || "",
            emailAddress: response.data.data.emailAddress || "",
          });
        }
      } catch (error) {
        toast.error("Failed to load expiry alert settings");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key as keyof typeof settings],
    }));
  };

  const handleChange = (key: keyof typeof settings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.patch("/api/settings/expiry-alerts", settings);
      if (response.data.success) {
        toast.success("Expiry alert settings saved successfully");
      } else {
        throw new Error(response.data.error || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Failed to save expiry alert settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSendReport = async () => {
    setSending(true);
    try {
      const response = await axios.post("/api/expiry-alerts/send");
      if (response.data.success) {
        const { whatsappUrl, buckets } = response.data.data || response.data;
        if (buckets) {
          toast.success(
            `Report sent! Expired: ${buckets.expired}, This month: ${buckets.month1}, Next month: ${buckets.month2}`
          );
        } else {
          toast.success("Details processed");
        }

        if (whatsappUrl) {
          window.open(whatsappUrl, "_blank");
        }
      } else {
        throw new Error(response.data.error || "Failed to send report");
      }
    } catch (error) {
      toast.error("Failed to send expiry report");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-8">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-xl font-bold">Expiry Alert Configuration</h2>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Notification Channels
          </h3>
          <div className="grid gap-4 bg-muted/30 p-4 rounded-xl border border-border">
            <div className="flex justify-between items-center">
              <span className="font-medium">Send via WhatsApp</span>
              <Switch
                checked={settings.enableWhatsApp}
                onCheckedChange={() => handleToggle("enableWhatsApp")}
              />
            </div>
            {settings.enableWhatsApp && (
               <div className="space-y-2 mt-2">
                 <Label htmlFor="whatsappNumber" className="font-semibold text-xs text-muted-foreground">WhatsApp Number</Label>
                 <Input
                   id="whatsappNumber"
                   type="text"
                   placeholder="91XXXXXXXXXX"
                   value={settings.whatsappNumber}
                   onChange={(e) => handleChange("whatsappNumber", e.target.value)}
                   className="max-w-md"
                 />
               </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-border mt-2">
              <span className="font-medium">Send via Email</span>
              <Switch
                checked={settings.enableEmail}
                onCheckedChange={() => handleToggle("enableEmail")}
              />
            </div>
            {settings.enableEmail && (
               <div className="space-y-2 mt-2">
                 <Label htmlFor="emailAddress" className="font-semibold text-xs text-muted-foreground">Email Address</Label>
                 <Input
                   id="emailAddress"
                   type="email"
                   placeholder="alert@yourpharmacy.com"
                   value={settings.emailAddress}
                   onChange={(e) => handleChange("emailAddress", e.target.value)}
                   className="max-w-md"
                 />
               </div>
            )}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Send Report Now
          </h3>
          <div className="space-y-6 bg-muted/30 p-5 rounded-xl border border-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
               <div>
                  <p className="font-medium text-foreground">Manual Dispatch</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[300px]">
                    Force Ayur-stock Pro to compile and dispatch the entire 6-month array across all configured channels instantly.
                  </p>
               </div>
               <Button onClick={handleSendReport} disabled={sending || (!settings.enableEmail && !settings.enableWhatsApp)} variant="secondary">
                 {sending ? (
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                 ) : (
                   <Send className="mr-2 h-4 w-4 text-primary" />
                 )}
                 Send Expiry Report
               </Button>
            </div>
            <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-3">
               Note: Report is also auto-sent on the 1st of every month at 8:00 AM.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
