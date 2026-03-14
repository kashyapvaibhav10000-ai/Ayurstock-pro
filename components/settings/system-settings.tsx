import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useState } from "react"

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    darkMode: false,
    enableNotifications: true,
    enableCloudBackup: true,
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
        <h2 className="font-semibold text-lg">System Preferences</h2>

        <div className="flex justify-between items-center">
          <span>Dark Mode</span>
          <Switch
            checked={settings.darkMode}
            onCheckedChange={() => handleToggle("darkMode")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Enable Notifications</span>
          <Switch
            checked={settings.enableNotifications}
            onCheckedChange={() => handleToggle("enableNotifications")}
          />
        </div>

        <div className="flex justify-between items-center">
          <span>Enable Cloud Backup</span>
          <Switch
            checked={settings.enableCloudBackup}
            onCheckedChange={() => handleToggle("enableCloudBackup")}
          />
        </div>
      </CardContent>
    </Card>
  )
}
