import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useState } from "react"

export default function BillingSettings() {
  const [settings, setSettings] = useState({
    enableRetail: true,
    enableWholesale: true,
    allowDiscounts: true,
    enableBarcode: true,
    autoPrintInvoice: false,
  })

  const handleToggle = (key: string) => {
    setSettings({
      ...settings,
      [key]: !settings[key as keyof typeof settings],
    })
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Billing Configuration</h2>

        <div className="flex justify-between items-center">
          <span>Enable Retail Mode</span>
          <Switch
            checked={settings.enableRetail}
            onCheckedChange={() => handleToggle("enableRetail")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Enable Wholesale Mode</span>
          <Switch
            checked={settings.enableWholesale}
            onCheckedChange={() => handleToggle("enableWholesale")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Allow Discounts</span>
          <Switch
            checked={settings.allowDiscounts}
            onCheckedChange={() => handleToggle("allowDiscounts")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Enable Barcode Scanner</span>
          <Switch
            checked={settings.enableBarcode}
            onCheckedChange={() => handleToggle("enableBarcode")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Auto Print Invoice</span>
          <Switch
            checked={settings.autoPrintInvoice}
            onCheckedChange={() => handleToggle("autoPrintInvoice")}
          />
        </div>
      </CardContent>
    </Card>
  )
}
