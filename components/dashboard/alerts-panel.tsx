"use client"

import { useInventoryAlerts } from "@/hooks/useInventoryAlerts"
import { useRealtimeInventory } from "@/hooks/useRealtimeInventory"
import { AlertCircle, TrendingDown, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function AlertsPanel() {
  const { data, refetch, isLoading } = useInventoryAlerts()
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMessage, setReconcileMessage] = useState("")

  useRealtimeInventory(refetch)

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">Loading alerts...</div>
    )
  }

  const expiryAlerts = data?.expiryAlerts || []
  const lowStockAlerts = data?.lowStock || []
  const lowStockMedicines = data?.lowStockMedicines || []
  const healthAlerts = data?.healthAlerts || {
    negativeStockBatches: [],
    expiredBatches: [],
    missingBatchNumbers: [],
  }
  const hasHealthIssues =
    healthAlerts.negativeStockBatches.length > 0 ||
    healthAlerts.expiredBatches.length > 0 ||
    healthAlerts.missingBatchNumbers.length > 0

  return (
    <div className="space-y-6">
      {/* SYSTEM HEALTH */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-5 w-5 text-slate-700" />
          <h3 className="text-slate-700 font-semibold">System Health Checks</h3>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={reconciling}
            onClick={async () => {
              try {
                setReconciling(true)
                setReconcileMessage("")
                const res = await fetch("/api/inventory/reconcile", { method: "POST" })
                const payload = await res.json()
                if (!res.ok || !payload.success) {
                  throw new Error(payload.message || "Failed to reconcile inventory")
                }
                const summary = payload.data
                const mismatchCount = summary.mismatches ? summary.mismatches.length : 0
                setReconcileMessage(
                  `Reconciled ${summary.updatedCount} batches. Mismatches: ${mismatchCount}. Negative: ${summary.negativeCount}`
                )
                refetch()
              } catch (error: any) {
                setReconcileMessage(error?.message || "Failed to reconcile inventory")
              } finally {
                setReconciling(false)
              }
            }}
          >
            {reconciling ? "Reconciling..." : "Run Reconciliation"}
          </Button>
          {reconcileMessage ? (
            <span className="text-xs text-slate-500">{reconcileMessage}</span>
          ) : null}
        </div>

        {!hasHealthIssues ? (
          <p className="text-sm text-gray-500">No critical issues detected.</p>
        ) : (
          <div className="space-y-3">
            {healthAlerts.negativeStockBatches.length > 0 ? (
              <div className="rounded border border-red-100 bg-red-50 p-3">
                <div className="text-sm font-semibold text-red-700">
                  Negative Stock Detected
                </div>
                <div className="mt-2 space-y-1 text-xs text-red-700">
                  {healthAlerts.negativeStockBatches.map((batch: any) => (
                    <div key={batch.id}>
                      {batch.medicine?.name} · Batch {batch.batchNumber || "N/A"} · Stock {batch.stockQty}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {healthAlerts.expiredBatches.length > 0 ? (
              <div className="rounded border border-amber-100 bg-amber-50 p-3">
                <div className="text-sm font-semibold text-amber-700">
                  Expired Batches Found
                </div>
                <div className="mt-2 space-y-1 text-xs text-amber-700">
                  {healthAlerts.expiredBatches.map((batch: any) => (
                    <div key={batch.id}>
                      {batch.medicine?.name} · Batch {batch.batchNumber || "N/A"} · Exp{" "}
                      {new Date(batch.expiryDate).toLocaleDateString()}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {healthAlerts.missingBatchNumbers.length > 0 ? (
              <div className="rounded border border-blue-100 bg-blue-50 p-3">
                <div className="text-sm font-semibold text-blue-700">
                  Missing Batch Numbers
                </div>
                <div className="mt-2 space-y-1 text-xs text-blue-700">
                  {healthAlerts.missingBatchNumbers.map((batch: any) => (
                    <div key={batch.id}>
                      {batch.medicine?.name} · Exp{" "}
                      {new Date(batch.expiryDate).toLocaleDateString()}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* EXPIRY ALERTS */}
      <div className="bg-white border border-red-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <h3 className="text-red-600 font-semibold">Critical Expiry Alerts</h3>
        </div>

        {expiryAlerts.length === 0 ? (
          <p className="text-sm text-gray-500">No expiry alerts</p>
        ) : (
          <div className="space-y-2">
            {expiryAlerts.map((item: any) => (
              <div key={item.id} className="bg-red-50 p-3 rounded border border-red-100">
                <div className="font-medium text-sm text-red-900">
                  {item.medicine.name} (Batch {item.batchNumber})
                </div>
                <div className="text-xs text-red-600 mt-1">
                  Expiry: {new Date(item.expiryDate).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LOW STOCK ALERTS */}
      <div className="bg-white border border-orange-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="h-5 w-5 text-orange-600" />
          <h3 className="text-orange-600 font-semibold">Low Stock Alerts</h3>
        </div>

        {lowStockMedicines.length === 0 ? (
          <p className="text-sm text-gray-500">No low stock alerts</p>
        ) : (
          <div className="space-y-2">
            {lowStockMedicines.map((item: any) => (
              <div key={item.id} className="bg-orange-50 p-3 rounded border border-orange-100">
                <div className="font-medium text-sm text-orange-900">
                  {item.name}
                </div>
                <div className="text-xs text-orange-600 mt-1">
                  Stock: {item.currentStock} (Min {item.threshold})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
