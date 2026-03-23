"use client"

import { useInventoryAlerts } from "@/hooks/useInventoryAlerts"
import { useRealtimeInventory } from "@/hooks/useRealtimeInventory"
import {
  AlertTriangle,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Package,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// ── Single alert row ────────────────────────────────────────────────────────
function AlertRow({
  color,
  icon: Icon,
  title,
  sub,
}: {
  color: "red" | "amber" | "orange" | "blue"
  icon: React.ElementType
  title: string
  sub: string
}) {
  const colors = {
    red:    { dot: "bg-red-500",    bg: "bg-red-50",    text: "text-red-700",    sub: "text-red-500",    ring: "ring-red-100"    },
    amber:  { dot: "bg-amber-500",  bg: "bg-amber-50",  text: "text-amber-800",  sub: "text-amber-600",  ring: "ring-amber-100"  },
    orange: { dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-800", sub: "text-orange-600", ring: "ring-orange-100" },
    blue:   { dot: "bg-blue-500",   bg: "bg-blue-50",   text: "text-blue-800",   sub: "text-blue-600",   ring: "ring-blue-100"   },
  }
  const c = colors[color]

  return (
    <div className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${c.bg} ring-1 ${c.ring}`}>
      <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${c.dot} flex items-center justify-center`}>
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold leading-snug truncate ${c.text}`}>{title}</p>
        <p className={`text-[11px] mt-0.5 ${c.sub}`}>{sub}</p>
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <p className={`text-[11px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-current/10 ${color}`}>
        {count}
      </span>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────
export function AlertsPanel() {
  const { data, refetch, isLoading } = useInventoryAlerts()
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMsg, setReconcileMsg] = useState("")

  useRealtimeInventory(refetch)

  const handleReconcile = useCallback(async () => {
    try {
      setReconciling(true)
      setReconcileMsg("")
      const res = await fetch("/api/inventory/reconcile", { method: "POST" })
      const payload = await res.json()
      if (!res.ok || !payload.success) throw new Error(payload.message || "Failed")
      const s = payload.data
      setReconcileMsg(`Fixed ${s.updatedCount ?? 0} batches · ${s.negativeCount ?? 0} negative`)
      refetch()
    } catch (e: any) {
      setReconcileMsg(e?.message || "Reconcile failed")
    } finally {
      setReconciling(false)
    }
  }, [refetch])

  const expiryAlerts     = data?.expiryAlerts || []
  const lowStockMedicines = data?.lowStockMedicines || []
  const healthAlerts     = data?.healthAlerts || { negativeStockBatches: [], expiredBatches: [], missingBatchNumbers: [] }

  const hasHealthIssues =
    healthAlerts.negativeStockBatches.length > 0 ||
    healthAlerts.expiredBatches.length > 0 ||
    healthAlerts.missingBatchNumbers.length > 0

  const totalAlerts = expiryAlerts.length + lowStockMedicines.length + (hasHealthIssues ? 1 : 0)

  return (
    <Card className="h-full flex flex-col rounded-2xl border-surface-border shadow-soft overflow-hidden">
      {/* ── Header ── */}
      <CardHeader className="px-5 py-4 border-b border-surface-border bg-surface shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-text-primary flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-orange-500" />
            Alerts & Health
          </CardTitle>
          {!isLoading && totalAlerts > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
              {totalAlerts}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">

        {isLoading ? (
          <div className="space-y-2 pt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-muted animate-pulse" />
            ))}
          </div>
        ) : totalAlerts === 0 ? (
          /* ── All clear state ── */
          <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
            <div className="h-14 w-14 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">All Clear</p>
              <p className="text-xs text-text-muted mt-0.5">No alerts at this time.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Expiry Alerts ── */}
            {expiryAlerts.length > 0 && (
              <div>
                <SectionHeader label="Expiry Alerts" count={expiryAlerts.length} color="text-red-600" />
                <div className="space-y-1.5">
                  {expiryAlerts.slice(0, 5).map((item: any) => {
                    const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000)
                    return (
                      <AlertRow
                        key={item.id}
                        color="red"
                        icon={Clock}
                        title={item.medicine.name}
                        sub={days < 0 ? `Expired ${Math.abs(days)}d ago · Batch ${item.batchNumber}` : `Expires in ${days}d · Batch ${item.batchNumber}`}
                      />
                    )
                  })}
                  {expiryAlerts.length > 5 && (
                    <p className="text-[11px] text-text-muted text-center pt-1">+{expiryAlerts.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Low Stock ── */}
            {lowStockMedicines.length > 0 && (
              <div>
                <SectionHeader label="Low Stock" count={lowStockMedicines.length} color="text-orange-600" />
                <div className="space-y-1.5">
                  {lowStockMedicines.slice(0, 6).map((item: any, i: number) => (
                    <AlertRow
                      key={i}
                      color={item.currentStock === 0 ? "red" : "orange"}
                      icon={Package}
                      title={item.name}
                      sub={item.currentStock === 0 ? "Out of stock · needs reorder" : `${item.currentStock} left · min ${item.threshold}`}
                    />
                  ))}
                  {lowStockMedicines.length > 6 && (
                    <p className="text-[11px] text-text-muted text-center pt-1">+{lowStockMedicines.length - 6} more</p>
                  )}
                </div>
              </div>
            )}

            {/* ── System Health ── */}
            {hasHealthIssues && (
              <div>
                <SectionHeader label="System Health" count={
                  healthAlerts.negativeStockBatches.length +
                  healthAlerts.expiredBatches.length +
                  healthAlerts.missingBatchNumbers.length
                } color="text-blue-600" />
                <div className="space-y-1.5">
                  {healthAlerts.negativeStockBatches.map((b: any) => (
                    <AlertRow key={b.id} color="red" icon={TrendingDown}
                      title={`${b.medicine?.name} — Negative Stock`}
                      sub={`Batch ${b.batchNumber || "N/A"} · Qty ${b.stockQty}`}
                    />
                  ))}
                  {healthAlerts.expiredBatches.map((b: any) => (
                    <AlertRow key={b.id} color="amber" icon={AlertTriangle}
                      title={`${b.medicine?.name} — Expired Batch`}
                      sub={`Batch ${b.batchNumber || "N/A"} · ${new Date(b.expiryDate).toLocaleDateString('en-IN')}`}
                    />
                  ))}
                  {healthAlerts.missingBatchNumbers.map((b: any) => (
                    <AlertRow key={b.id} color="blue" icon={ShieldCheck}
                      title={`${b.medicine?.name} — No Batch No.`}
                      sub={`Exp: ${new Date(b.expiryDate).toLocaleDateString('en-IN')}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Reconcile ── */}
        <div className="pt-2 border-t border-surface-border">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${reconciling ? 'animate-spin' : ''}`} />
            {reconciling ? "Reconciling…" : "Run stock reconciliation"}
          </button>
          {reconcileMsg && (
            <p className="mt-1 text-[10px] text-text-muted">{reconcileMsg}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
