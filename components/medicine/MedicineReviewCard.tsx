"use client"

/**
 * Mobile-first card view for a single row of the distributor invoice OCR
 * review screen. Renders as a stacked card instead of a compressed table row.
 *
 * Design goals (see task requirements):
 * - Every field always has a visible label (no header-row-only labels).
 * - Touch targets are >= 48x48px.
 * - Numeric fields get `inputMode` so mobile keyboards switch to numeric.
 * - No horizontal scrolling — everything wraps within the viewport width.
 * - Editing one field never shifts unrelated fields (each field is in its
 *   own fixed-position grid cell, not reflowed inline text).
 */

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AlertCircle, Trash2 } from "lucide-react"

export type FieldConfidence = "high" | "medium" | "low"

export interface MedicineConfidence {
  overall: FieldConfidence
  name?: FieldConfidence
  batch?: FieldConfidence
  expiry?: FieldConfidence
  quantity?: FieldConfidence
  mrp?: FieldConfidence
  packing?: FieldConfidence
}

export interface ReviewCardMedicine {
  name: string
  company: string
  packing?: string
  mrp?: number
  purchaseRate?: number
  tradePrice?: number
  category?: string
  batchNo?: string
  expiryDate?: string
  quantity?: number
  action?: "create" | "update" | "skip"
  selected?: boolean
  isManual?: boolean
  confidence?: MedicineConfidence
}

interface MedicineReviewCardProps {
  medicine: ReviewCardMedicine
  index: number
  issues: string[]
  duplicate: boolean
  category: string
  packagingOptions: string[]
  categoryOptions: string[]
  restockLabel: "RESTOCK" | "NEW" | "MANUAL" | null
  isExpired: boolean
  isNearExpiry: boolean
  confClass: (conf?: FieldConfidence) => string
  onToggleSelected: (index: number) => void
  onChange: (index: number, field: string, value: any) => void
  onCategoryChange: (index: number, category: string) => void
  onDelete: (index: number) => void
}

// Minimum comfortable touch target per WCAG / platform guidance.
const TOUCH = "min-h-[48px]"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
      {children}
    </label>
  )
}

export default function MedicineReviewCard({
  medicine,
  index,
  issues,
  duplicate,
  category,
  packagingOptions,
  categoryOptions,
  restockLabel,
  isExpired,
  isNearExpiry,
  confClass,
  onToggleSelected,
  onChange,
  onCategoryChange,
  onDelete,
}: MedicineReviewCardProps) {
  const hasIssues = issues.length > 0
  const isDeselected = medicine.selected === false

  return (
    <div
      // `content-visibility: auto` lets the browser skip layout/paint work for
      // off-screen cards, giving near-virtualization performance for 100-200
      // row imports without needing a virtualization library.
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 420px" }}
      className={`rounded-2xl border-2 p-4 space-y-4 transition-colors ${
        hasIssues
          ? "border-red-300 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
          : "border-border bg-surface"
      } ${isDeselected ? "opacity-50" : ""} ${
        medicine.isManual ? "border-l-4 border-l-blue-500" : ""
      }`}
    >
      {/* Header row: checkbox, row number, status badge, delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="checkbox"
            aria-label={`Include ${medicine.name || "this row"} in import`}
            checked={medicine.selected !== false}
            onChange={() => onToggleSelected(index)}
            className="h-6 w-6 shrink-0 rounded border-2 border-border text-primary focus:ring-2 focus:ring-primary/30 cursor-pointer"
          />
          <span className="text-xs font-bold text-muted-foreground shrink-0">#{index + 1}</span>
          {restockLabel && (
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                restockLabel === "RESTOCK"
                  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  : restockLabel === "MANUAL"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
              }`}
            >
              {restockLabel}
            </span>
          )}
        </div>

        {duplicate ? (
          <select
            aria-label="Action for duplicate medicine"
            value={medicine.action || "skip"}
            onChange={(e) => onChange(index, "action", e.target.value)}
            className={`rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 text-xs font-bold text-amber-800 dark:text-amber-300 ${TOUCH}`}
          >
            <option value="skip">Skip</option>
            <option value="update">Update</option>
          </select>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(index)}
            aria-label={`Remove ${medicine.name || "this row"}`}
            className="h-12 w-12 shrink-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Issues */}
      {hasIssues && (
        <div className="flex flex-wrap gap-1.5" role="alert">
          {issues.map((issue) => (
            <span
              key={issue}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            >
              <AlertCircle className="w-3 h-3" />
              {issue}
            </span>
          ))}
        </div>
      )}

      {/* Medicine Name — full width, most prominent field */}
      <div>
        <FieldLabel>Medicine Name</FieldLabel>
        <Input
          value={medicine.name}
          onChange={(e) => onChange(index, "name", e.target.value)}
          aria-label="Medicine name"
          className={`text-base font-semibold border-2 ${TOUCH} ${confClass(medicine.confidence?.name)}`}
        />
      </div>

      {/* Company */}
      <div>
        <FieldLabel>Company</FieldLabel>
        <Input
          value={medicine.company}
          onChange={(e) => onChange(index, "company", e.target.value)}
          aria-label="Company"
          className={`text-base border-2 ${TOUCH} ${confClass(medicine.confidence?.overall)}`}
        />
      </div>

      {/* Category + Packing — 2-column on wider phones, stacked on very narrow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Category</FieldLabel>
          <select
            value={category}
            onChange={(e) => onCategoryChange(index, e.target.value)}
            aria-label="Category"
            className={`w-full rounded-lg border-2 border-border bg-surface px-3 text-base focus:border-primary focus:ring-2 focus:ring-primary/20 ${TOUCH}`}
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Packaging</FieldLabel>
          <select
            value={medicine.packing || ""}
            onChange={(e) => onChange(index, "packing", e.target.value)}
            aria-label="Packaging"
            className={`w-full rounded-lg border-2 px-3 text-base ${TOUCH} ${confClass(medicine.confidence?.packing)}`}
          >
            <option value="">Select</option>
            {packagingOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch + Expiry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Batch No.</FieldLabel>
          <Input
            value={medicine.batchNo || ""}
            onChange={(e) => onChange(index, "batchNo", e.target.value)}
            aria-label="Batch number"
            className={`text-base font-mono border-2 ${TOUCH} ${confClass(medicine.confidence?.batch)}`}
          />
        </div>
        <div>
          <FieldLabel>Expiry Date</FieldLabel>
          <Input
            value={medicine.expiryDate || ""}
            onChange={(e) => onChange(index, "expiryDate", e.target.value)}
            aria-label="Expiry date"
            placeholder="MM/YYYY"
            className={`text-base border-2 ${TOUCH} ${confClass(medicine.confidence?.expiry)} ${
              isExpired
                ? "text-red-700 font-bold bg-red-50 dark:bg-red-950/30 dark:text-red-400"
                : isNearExpiry
                  ? "text-amber-700 font-bold bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
                  : ""
            }`}
          />
          {isExpired && (
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-1">Expired ❌</p>
          )}
          {isNearExpiry && (
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1">Near Expiry ⚠️</p>
          )}
        </div>
      </div>

      {/* MRP + Purchase Rate — numeric keyboard on mobile via inputMode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>MRP (₹)</FieldLabel>
          <Input
            type="number"
            inputMode="decimal"
            value={medicine.mrp ?? ""}
            onChange={(e) => onChange(index, "mrp", Number(e.target.value))}
            aria-label="MRP"
            className={`text-base font-bold border-2 ${TOUCH} ${confClass(medicine.confidence?.mrp)}`}
          />
        </div>
        <div>
          <FieldLabel>Purchase Rate (₹)</FieldLabel>
          <Input
            type="number"
            inputMode="decimal"
            value={medicine.purchaseRate ?? medicine.tradePrice ?? ""}
            onChange={(e) => onChange(index, "purchaseRate", Number(e.target.value))}
            aria-label="Purchase rate"
            className={`text-base font-bold border-2 border-border ${TOUCH}`}
          />
        </div>
      </div>

      {/* Quantity — full width, largest touch target since it's edited most */}
      <div>
        <FieldLabel>Quantity</FieldLabel>
        <Input
          type="number"
          inputMode="numeric"
          value={medicine.quantity ?? ""}
          onChange={(e) => onChange(index, "quantity", Number(e.target.value))}
          aria-label="Quantity"
          className={`text-lg font-bold text-center border-2 h-14 ${confClass(medicine.confidence?.quantity)}`}
        />
      </div>
    </div>
  )
}
