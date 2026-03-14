import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { useState } from "react"

export default function InventorySettings() {
  const [settings, setSettings] = useState({
    enableBatchTracking: true,
    enableExpiryTracking: true,
    autoFEFOBilling: true,
    lowStockThreshold: "5",
    nearExpiryDays: "30",
  })

  const handleToggle = (key: string) => {
    setSettings({
      ...settings,
      [key]: !settings[key as keyof typeof settings],
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({
      ...settings,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="font-semibold text-lg">Inventory Settings</h2>

        <div className="flex justify-between items-center">
          <span>Enable Batch Tracking</span>
          <Switch
            checked={settings.enableBatchTracking}
            onCheckedChange={() => handleToggle("enableBatchTracking")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Enable Expiry Tracking</span>
          <Switch
            checked={settings.enableExpiryTracking}
            onCheckedChange={() => handleToggle("enableExpiryTracking")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Auto FEFO Billing</span>
          <Switch
            checked={settings.autoFEFOBilling}
            onCheckedChange={() => handleToggle("autoFEFOBilling")}
          />
        </div>

        <Input
          placeholder="Low Stock Alert Threshold"
          name="lowStockThreshold"
          type="number"
          value={settings.lowStockThreshold}
          onChange={handleChange}
        />

        <Input
          placeholder="Near Expiry Alert (Days)"
          name="nearExpiryDays"
          type="number"
          value={settings.nearExpiryDays}
          onChange={handleChange}
        />
      </CardContent>
    </Card>
  )
}
