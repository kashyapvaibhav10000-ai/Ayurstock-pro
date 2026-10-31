"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";

const CAP_FIELDS = [
  { key: "maxDiscountPercentCashier", label: "Cashier" },
  { key: "maxDiscountPercentManager", label: "Manager" },
  { key: "maxDiscountPercentAdmin", label: "Admin" },
] as const;

type Caps = Record<(typeof CAP_FIELDS)[number]["key"], number>;

export default function BillingSettings() {
  const { isAdmin } = useAuth();
  const [caps, setCaps] = useState<Caps>({
    maxDiscountPercentCashier: 10,
    maxDiscountPercentManager: 25,
    maxDiscountPercentAdmin: 100,
  });
  const [settings, setSettings] = useState({
    enableRetail: true,
    enableWholesale: true,
    allowDiscounts: true,
    enableBarcode: true,
    autoPrintInvoice: false,
    gstMode: "inclusive" as "inclusive" | "exclusive",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      try {
        const response = await axios.get("/api/settings/billing");
        if (response.data.success && mounted) {
          setSettings({
            enableRetail: response.data.data.enableRetail,
            enableWholesale: response.data.data.enableWholesale,
            allowDiscounts: response.data.data.allowDiscounts,
            enableBarcode: response.data.data.enableBarcode,
            autoPrintInvoice: response.data.data.autoPrintInvoice,
            gstMode: response.data.data.gstMode,
          });
          setCaps({
            maxDiscountPercentCashier: response.data.data.maxDiscountPercentCashier,
            maxDiscountPercentManager: response.data.data.maxDiscountPercentManager,
            maxDiscountPercentAdmin: response.data.data.maxDiscountPercentAdmin,
          });
        }
      } catch (error) {
        toast.error("Failed to load billing settings");
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
      [key]: !prev[key],
    }));
  };

  const handleChange = (key: keyof typeof settings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Discount limits are admin-only; the server rejects them from anyone else.
      const response = await axios.patch("/api/settings/billing", isAdmin ? { ...settings, ...caps } : settings);
      if (response.data.success) {
        toast.success("Billing settings saved successfully");
      } else {
        throw new Error(response.data.error || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Failed to save billing settings");
    } finally {
      setSaving(false);
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
          <h2 className="text-xl font-bold">Billing Configuration</h2>
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
            General Toggles
          </h3>
          <div className="grid gap-4 bg-muted/30 p-4 rounded-xl border border-border">
            <div className="flex justify-between items-center">
              <span className="font-medium">Enable Retail Mode</span>
              <Switch
                checked={settings.enableRetail}
                onCheckedChange={() => handleToggle("enableRetail")}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Enable Wholesale Mode</span>
              <Switch
                checked={settings.enableWholesale}
                onCheckedChange={() => handleToggle("enableWholesale")}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Allow Discounts</span>
              <Switch
                checked={settings.allowDiscounts}
                onCheckedChange={() => handleToggle("allowDiscounts")}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Enable Barcode Scanner</span>
              <Switch
                checked={settings.enableBarcode}
                onCheckedChange={() => handleToggle("enableBarcode")}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Auto Print Invoice</span>
              <Switch
                checked={settings.autoPrintInvoice}
                onCheckedChange={() => handleToggle("autoPrintInvoice")}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            GST & Pricing
          </h3>
          <div className="space-y-6 bg-muted/30 p-5 rounded-xl border border-border">
            <div className="space-y-4">
              <Label className="text-base font-semibold">GST Mode</Label>
              <RadioGroup
                value={settings.gstMode}
                onValueChange={(value: string) => handleChange("gstMode", value as "inclusive" | "exclusive")}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="inclusive" id="r1" />
                  <Label htmlFor="r1" className="cursor-pointer">GST Inclusive (MRP includes tax)</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="exclusive" id="r2" />
                  <Label htmlFor="r2" className="cursor-pointer">GST Exclusive (tax added on top)</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground italic mt-2">
                Inclusive: GST is extracted from MRP. Exclusive: GST is added on top of rate.
              </p>
            </div>
            <div className="space-y-3">
              <Label className="text-base font-semibold">Maximum line discount by role (%)</Label>
              <div className="grid grid-cols-3 gap-3">
                {CAP_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={key} className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      id={key}
                      type="number"
                      min={0}
                      max={100}
                      disabled={!isAdmin}
                      value={caps[key]}
                      onChange={(e) =>
                        setCaps((prev) => ({ ...prev, [key]: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground italic">
                Enforced at billing. Only managers and admins can change a price, never above MRP; only admins can sell below cost.
                {!isAdmin && " Only an admin can change these limits."}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
