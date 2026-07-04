"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, CheckCircle, Upload, FileText, Loader2, Play, CheckCircle2, Plus } from "lucide-react"
import { toast } from "sonner"
import MedicineReviewCard from "./MedicineReviewCard"

const CATEGORY_OPTIONS = [
  "Tablet",
  "Capsule",
  "Powder",
  "Churna",
  "Asav",
  "Syrup",
  "Oil",
  "Cream",
  "Gel",
  "Drops",
  "Bhasma",
  "Vati",
  "Chawanprash",
  "Other",
]

const PACKAGING_OPTIONS: Record<string, string[]> = {
  Tablet: ["10 Tab", "20 Tab", "30 Tab", "40 Tab", "60 Tab", "80 Tab", "100 Tab", "120 Tab"],
  Capsule: ["10 Cap", "20 Cap", "30 Cap", "60 Cap"],
  Powder: ["50 gm", "100 gm", "200 gm", "500 gm", "1 kg"],
  Churna: ["50 gm", "100 gm", "200 gm", "500 gm", "1 kg"],
  Asav: ["100 ml", "200 ml", "450 ml", "680 ml", "1 L"],
  Syrup: ["100 ml", "200 ml", "450 ml", "680 ml", "1 L"],
  Oil: ["50 ml", "100 ml", "200 ml", "500 ml", "1 L"],
  Cream: ["15 gm", "30 gm", "50 gm"],
  Gel: ["15 gm", "30 gm", "50 gm"],
  Drops: ["10 ml", "15 ml", "30 ml"],
  Bhasma: ["10 gm", "25 gm", "50 gm"],
  Vati: ["10 Tab", "20 Tab", "30 Tab", "60 Tab"],
  Chawanprash: ["250 gm", "500 gm", "1 kg"],
  Other: [],
}

const BAD_NAME_REGEX = /(loss|appetite|colic|diarrhoea|diarrhea|sprue|epileptic|insanity|blood purifier|health tonic|chronic|general debility|purifier|debility|tonic)/i
const PACKING_TOKENS = /(bottle|strip|pack|pouch|tube|ml|mg|gm|gms|kg|capsule|tablet|syrup|powder|churna|cap|tab)\b/i

export type FieldConfidence = "high" | "medium" | "low"

export type MedicineConfidence = {
  overall: FieldConfidence
  name?: FieldConfidence
  batch?: FieldConfidence
  expiry?: FieldConfidence
  quantity?: FieldConfidence
  mrp?: FieldConfidence
  packing?: FieldConfidence
}

export interface RestockData {
  exists: boolean
  currentStock: number
  lastPurchasePrice: number | null
  lastMrp: number | null
  batchCount: number
}

interface ParsedMedicine {
  code?: string
  name: string
  company: string
  packing?: string
  mrp?: number
  tradePrice?: number
  purchaseRate?: number
  category?: string
  hsn?: string
  batchNo?: string
  expiryDate?: string
  barcode?: string
  rackLocation?: string
  quantity?: number
  action?: "create" | "update" | "skip"
  selected?: boolean
  validationError?: string
  confidence?: MedicineConfidence
  isManual?: boolean
}

interface ImportPriceListProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (count: number) => void
}

// ── Error banner with guidance ─────────────────────────────────────────
function SmartErrorBanner({ errorCode, message }: { errorCode?: string; message: string }) {
  const isScanned = errorCode === "NO_TEXT"

  const getGuidance = () => {
    switch (errorCode) {
      case "NO_TEXT": return 'Click "Run OCR" below to extract text from this scanned PDF using your browser.'
      case "EMPTY_AFTER_CLEAN": return "The PDF text was extracted but no medicine data was recognized. Try a different file."
      case "AI_FAILED": return "The AI parsing service failed temporarily. Please try again."
      case "NO_API_KEY": return "The AI API key is not configured. Contact your administrator."
      default: return ""
    }
  }

  const guidance = getGuidance()

  return (
    <div className={`rounded-lg p-4 flex items-start gap-3 ${isScanned ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800" : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40"}`}>
      {isScanned ? <span className="text-xl">📄</span> : <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
      <div className="space-y-1">
        <span className={`text-sm font-medium ${isScanned ? "text-amber-800 dark:text-amber-300" : "text-red-700 dark:text-red-400"}`}>{message}</span>
        {guidance && <p className={`text-xs ${isScanned ? "text-amber-600 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>{guidance}</p>}
      </div>
    </div>
  )
}

// ── OCR Progress bar component ─────────────────────────────────────────
function OcrProgress({ phase, page, totalPages, percent, message }: {
  phase: string; page: number; totalPages: number; percent: number; message: string
}) {
  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          {phase === "loading" ? "📖 Loading PDF..." :
           phase === "rendering" ? `🖼️ Rendering page ${page}/${totalPages}` :
           phase === "ocr" ? `🔍 OCR page ${page}/${totalPages}` :
           phase === "done" ? "✅ OCR complete!" : message}
        </span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="w-full bg-surface-muted rounded-full h-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

export default function ImportPriceList({ isOpen, onClose, onSuccess }: ImportPriceListProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [parsedMedicines, setParsedMedicines] = useState<ParsedMedicine[]>([])
  const [error, setError] = useState<string>("")
  const [errorCode, setErrorCode] = useState<string>("")
  const [pdfType, setPdfType] = useState<string>("")
  const [provider, setProvider] = useState<string>("")
  const [step, setStep] = useState<"upload" | "ocr" | "preview" | "importing">("upload")
  const [companies, setCompanies] = useState<string[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>("")
  const [newCompany, setNewCompany] = useState<string>("")
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set())
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [ocrProgress, setOcrProgressState] = useState({ phase: "loading", page: 0, totalPages: 0, percent: 0, message: "" })
  
  // ── New State for 7-Upgrade features ─────────────────────────────────
  const [invoiceNumber, setInvoiceNumber] = useState<string>("")
  const [invoiceDate, setInvoiceDate] = useState<string>("")
  const [duplicateWarning, setDuplicateWarning] = useState<{ isDuplicate: boolean, message: string } | null>(null)
  const [forceImport, setForceImport] = useState(false)
  const [restockData, setRestockData] = useState<Record<string, RestockData>>({})
  const [validationErrors, setValidationErrors] = useState<{ index: number, field: string, message: string }[]>([])

  const abortControllerRef = useRef<AbortController | null>(null)
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  useEffect(() => {
    if (!isOpen) return
    const loadCompanies = async () => {
      try {
        const res = await fetch("/api/companies", { headers: authHeaders })
        const payload = await res.json()
        if (payload.success && Array.isArray(payload.data)) {
          setCompanies(payload.data.map((row: any) => row.name))
        }
      } catch {
        setCompanies([])
      }
    }
    const loadExisting = async () => {
      try {
        const res = await fetch("/api/medicines/search?query=&limit=500", { headers: authHeaders })
        const payload = await res.json()
        if (payload.success && Array.isArray(payload.data)) {
          const keys = new Set<string>(
            payload.data.map((row: any) =>
              `${String(row.name || "").toLowerCase()}|${String(row.company || "").toLowerCase()}|${String(row.packing || "").toLowerCase()}`
            )
          )
          setExistingKeys(keys)
        }
      } catch {
        setExistingKeys(new Set())
      }
    }
    loadCompanies()
    loadExisting()
  }, [isOpen])

  useEffect(() => {
    if (step !== "preview") return
    if (parsedMedicines.length === 0) return
    const frequency = parsedMedicines.reduce<Record<string, number>>((acc, row) => {
      if (!row.company) return acc
      acc[row.company] = (acc[row.company] || 0) + 1
      return acc
    }, {})
    const topCompany = Object.entries(frequency).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (topCompany && !selectedCompany) {
      setSelectedCompany(topCompany)
      applyCompanyToRows(topCompany)
    }
  }, [parsedMedicines, step])

  useEffect(() => {
    if (step !== "preview") return
    setParsedMedicines((prev) =>
      prev.map((row) => {
        const category = row.category || detectCategory(row.packing || row.name)
        const options = PACKAGING_OPTIONS[category] || []
        const packing = row.packing || (options.length > 0 ? options[0] : "")
        const action = row.action || (isDuplicate(row) ? "skip" : "create")
        return { ...row, category, packing, action }
      })
    )
  }, [step, existingKeys])

  // ── Upgrade 5: Restock Detection ─────────────────────────────────────
  useEffect(() => {
    if (step !== "preview") return
    if (parsedMedicines.length === 0) return

    const fetchRestock = async () => {
      try {
        const payload = parsedMedicines.map(m => ({ name: m.name, company: m.company, packing: m.packing }))
        const res = await fetch("/api/medicine/check-restock", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ medicines: payload })
        })
        const data = await res.json()
        if (data.success && data.results) {
          const newRestockData: Record<string, RestockData> = {}
          parsedMedicines.forEach((m, idx) => {
            const key = `${m.name?.toLowerCase()}|${m.company?.toLowerCase() || ''}`
            newRestockData[key] = data.results[idx]
          })
          setRestockData(newRestockData)
        }
      } catch (err) {
        console.error("Failed to fetch restock info", err)
      }
    }

    const firstKey = `${parsedMedicines[0]?.name?.toLowerCase()}|${parsedMedicines[0]?.company?.toLowerCase() || ''}`
    if (!restockData[firstKey]) fetchRestock()
  }, [step, parsedMedicines.length])

  // ── Upgrade 3: Checkbox Toggle Handlers ─────────────────────────────
  const toggleSelectAll = () => {
    const allSelected = parsedMedicines.every(m => m.selected !== false)
    setParsedMedicines(prev => prev.map(m => ({ ...m, selected: !allSelected })))
  }

  const toggleSelectRow = (index: number) => {
    setParsedMedicines(prev => prev.map((m, i) => i === index ? { ...m, selected: m.selected === false ? true : false } : m))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError("")
      setErrorCode("")
    }
  }

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first")
      return
    }

    setLoading(true)
    setError("")
    setErrorCode("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/medicine/import-price-list", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`Parsed ${result.medicines?.length || 0} medicines from price list`)
        setPdfType(result.pdfType || "searchable")
        setProvider(result.provider || "")
        const normalized = (result.medicines || []).map((row: ParsedMedicine) => {
          const category = row.category || detectCategory(row.packing || row.name)
          const options = PACKAGING_OPTIONS[category] || []
          const packing = row.packing || (options.length > 0 ? options[0] : "")
          return { ...row, category, packing, selected: true } // Upgrade 3 defaulting to selected
        })
        setParsedMedicines(normalized)
        
        // Extract invoice metadata if API returned it (we updated aiParser for this)
        if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber)
        if (result.invoiceDate) setInvoiceDate(result.invoiceDate)
        if (result.supplierName) {
           setSelectedCompany(result.supplierName)
           applyCompanyToRows(result.supplierName)
        } else {
           setSelectedCompany("")
        }
        
        setNewCompany("")
        setStep("preview")
      } else if (result.errorCode === "NO_TEXT") {
        setPdfType("scanned")
        setErrorCode("NO_TEXT")
        setError(result.message || "This PDF appears to be scanned.")
        toast.warning("Scanned PDF detected. OCR required.")
      } else {
        setErrorCode(result.errorCode || "")
        setError(result.message || "Failed to parse file")
        toast.error(result.message || "Failed to parse file")
      }
    } catch (err) {
      setError("Failed to upload file. Please try again.")
      toast.error("Network error while uploading file")
    } finally {
      setLoading(false)
    }
  }

  // ── Client-side OCR handler ─────────────────────────────────────────
  const handleRunOcr = async () => {
    if (!file) return
    setStep("ocr")
    setError("")
    setErrorCode("")

    try {
      const { ocrPdfInBrowser } = await import("@/lib/pdfOcrClient")

      const extractedText = await ocrPdfInBrowser(file, (progress) => {
        setOcrProgressState(progress)
      })

      if (!extractedText.trim()) {
        toast.error("OCR completed but no text could be extracted.")
        setError("OCR completed but no text could be extracted.")
        setErrorCode("")
        setStep("upload")
        return
      }

      setOcrProgressState({ phase: "done", page: 0, totalPages: 0, percent: 95, message: "Sending to AI parser..." })

      const formData = new FormData()
      formData.append("extractedText", extractedText)

      const response = await fetch("/api/medicine/import-price-list", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`OCR successful: extracted ${result.medicines?.length || 0} medicines`)
        setPdfType("scanned")
        setProvider(result.provider || "")
        const normalized = (result.medicines || []).map((row: ParsedMedicine) => {
          const category = row.category || detectCategory(row.packing || row.name)
          const options = PACKAGING_OPTIONS[category] || []
          const packing = row.packing || (options.length > 0 ? options[0] : "")
          return { ...row, category, packing, selected: true }
        })
        setParsedMedicines(normalized)

        if (result.invoiceNumber) setInvoiceNumber(result.invoiceNumber)
        if (result.invoiceDate) setInvoiceDate(result.invoiceDate)
        if (result.supplierName) {
           setSelectedCompany(result.supplierName)
           applyCompanyToRows(result.supplierName)
        } else {
           setSelectedCompany("")
        }

        setNewCompany("")
        setStep("preview")
      } else {
        setErrorCode(result.errorCode || "")
        setError(result.message || "AI parsing found no medicines.")
        toast.error(result.message || "AI parsing failed")
        setStep("upload")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OCR processing failed"
      setError(msg)
      toast.error(msg)
      setErrorCode("")
      setStep("upload")
    }
  }

  const handleImport = async (overrideForce?: boolean) => {
    const activeForce = overrideForce ?? forceImport
    setStep("importing")
    setLoading(true)
    setValidationErrors([])

    try {
      // Upgrade 3: Filter out unselected rows
      const selectedRows = parsedMedicines.filter((row) => row.action !== "skip" && row.selected !== false)
      
      // Manual Row Validation: Check for empty medicine name in selected manual rows
      const emptyManualNames = selectedRows.filter(r => r.isManual && (!r.name || r.name.trim() === ""))
      if (emptyManualNames.length > 0) {
        toast.error("Please fill in medicine name for all manually added rows")
        setStep("preview")
        setLoading(false)
        return
      }

      const payloadRows = selectedRows
      
      const response = await fetch("/api/medicine/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ 
          medicines: payloadRows,
          invoiceNumber: invoiceNumber || undefined,
          supplierName: selectedCompany || undefined,
          forceImport: activeForce
        }),
      })

      const result = await response.json()

      // Upgrade 1: Duplicate Invoice handling
      if (result.isDuplicate && !forceImport) {
        setDuplicateWarning({ isDuplicate: true, message: result.message })
        setStep("preview")
        setLoading(false)
        return
      }

      if (result.validationErrors && result.validationErrors.length > 0) {
        setValidationErrors(result.validationErrors)
        toast.warning(`Found ${result.validationErrors.length} validation errors on rows. Check highlights.`)
      }

      if (result.success) {
        const msg = result.batches
          ? `✅ ${result.count || 0} new + ${result.updated || 0} updated medicines | ${result.batches} inventory batches (${result.totalStock} units)`
          : `✅ ${result.count || 0} medicines imported`;
        toast.success(msg, { duration: 6000 })
        onSuccess(result.count)
        onClose()
        setStep("upload")
        setFile(null)
        setParsedMedicines([])
        setInvoiceNumber("")
        setDuplicateWarning(null)
        setForceImport(false)
      } else {
        setError(result.message || "Failed to import medicines")
        toast.error(result.message || "Import failed")
        setStep("preview")
      }
    } catch (err) {
      setError("Failed to import medicines. Please try again.")
      toast.error("Network error during import")
      setStep("preview")
    } finally {
      setLoading(false)
    }
  }

  const removeMedicine = (index: number) => {
    setParsedMedicines(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddManualRow = () => {
    const newRow: ParsedMedicine = {
      name: "",
      company: selectedCompany || "",
      category: "Powder",
      packing: "",
      selected: true,
      isManual: true,
      action: "create",
      confidence: { overall: "high" }
    }
    setParsedMedicines((prev) => [...prev, newRow])
    toast.success("New manual row added")
  }

  const updateMedicine = (index: number, field: keyof ParsedMedicine, value: any) => {
    setParsedMedicines((prev) =>
      prev.map((item, rowIndex) => (rowIndex === index ? { ...item, [field]: value } : item))
    )
  }

  const applyCompanyToRows = (company: string) => {
    setParsedMedicines((prev) => prev.map((row) => ({ ...row, company })))
  }

  const detectCategory = (packingText?: string) => {
    const text = (packingText || "").toLowerCase()
    if (text.includes("tab") || text.includes("vati")) return "Tablet"
    if (text.includes("cap")) return "Capsule"
    if (text.includes("churna")) return "Churna"
    if (text.includes("bhasma")) return "Bhasma"
    if (text.includes("drops")) return "Drops"
    if (text.includes("gel")) return "Gel"
    if (text.includes("cream")) return "Cream"
    if (text.includes("oil") || text.includes("taila")) return "Oil"
    if (text.includes("powder") || text.includes("gm") || text.includes("kg")) return "Powder"
    if (text.includes("asav") || text.includes("arishta")) return "Asav"
    if (text.includes("syrup") || text.includes("ml")) return "Syrup"
    return "Other"
  }

  const isDuplicate = (row: ParsedMedicine) => {
    const key = `${String(row.name || "").toLowerCase()}|${String(row.company || "").toLowerCase()}|${String(
      row.packing || ""
    ).toLowerCase()}`
    return existingKeys.has(key)
  }

  const handleCategoryChange = (index: number, nextCategory: string) => {
    const options = PACKAGING_OPTIONS[nextCategory] || []
    setParsedMedicines((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const nextPacking = options.length > 0 ? options[0] : row.packing || ""
        return { ...row, category: nextCategory, packing: nextPacking }
      })
    )
  }

  const rowIssues = (row: ParsedMedicine) => {
    const issues: string[] = []
    if (!row.name) issues.push("Missing name")
    if (row.name && row.name.length > 40) issues.push("Name > 40 chars")
    if (row.name && row.name.trim().split(/\s+/).length > 5) issues.push("Name looks like description")
    if (row.name && (/\d/.test(row.name) || PACKING_TOKENS.test(row.name) || BAD_NAME_REGEX.test(row.name))) {
      issues.push("Name looks like description")
    }
    if (!row.category) issues.push("Missing category")
    if (!row.packing) issues.push("Missing packing")
    const category = row.category || detectCategory(row.packing || row.name)
    const options = PACKAGING_OPTIONS[category] || []
    if (category !== "Other" && (!row.packing || (options.length > 0 && !options.includes(row.packing)))) {
      issues.push("Packaging mismatch")
    }
    if (isDuplicate(row)) issues.push("Duplicate medicine found")
    return issues
  }

  const invalidRows = useMemo(() => {
    return parsedMedicines.map(rowIssues)
  }, [parsedMedicines, existingKeys])

  const hasBlockingIssues = useMemo(() => {
    return invalidRows.some((issues) =>
      issues.some((issue) =>
        ["Missing name", "Name > 40 chars", "Missing category", "Missing packing"].includes(issue)
      )
    )
  }, [invalidRows])

  const isExpired = (dateStr?: string) => {
    if (!dateStr || dateStr.trim() === '') return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d < new Date();
  }
  
  const isNearExpiry = (dateStr?: string) => {
    if (!dateStr || dateStr.trim() === '') return false;
    const d = new Date(dateStr);
    const now = new Date();
    if (isNaN(d.getTime())) return false;
    const msIn6Months = 6 * 30 * 24 * 60 * 60 * 1000;
    return d > now && d.getTime() - now.getTime() < msIn6Months;
  }

  const getConfClass = (conf?: string) => {
    if (conf === 'high') return 'bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40 focus:border-emerald-400'
    if (conf === 'medium') return 'bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-900/40 focus:border-amber-400'
    if (conf === 'low') return 'bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-300 border-red-200 dark:border-red-900/40 focus:border-red-400'
    return 'bg-surface border-border focus:border-primary'
  }

  const resetModal = () => {
    setFile(null)
    setParsedMedicines([])
    setError("")
    setErrorCode("")
    setPdfType("")
    setProvider("")
    setStep("upload")
    onClose()
  }

  const handleCompanySelect = (value: string) => {
    setSelectedCompany(value)
    if (value) {
      applyCompanyToRows(value)
    }
  }

  // ── Upgrade 4: Sort Problems First ─────────────────────────────
  const sortProblemsFirst = () => {
    setParsedMedicines((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const issuesA = rowIssues(a)
        const issuesB = rowIssues(b)
        
        // 1. Validation Blocking Issues
        const hasBlockingA = issuesA.some(i => ["Missing name", "Missing category", "Missing packing"].includes(i))
        const hasBlockingB = issuesB.some(i => ["Missing name", "Missing category", "Missing packing"].includes(i))
        if (hasBlockingA !== hasBlockingB) return hasBlockingA ? -1 : 1

        // 2. Expired
        const expiredA = isExpired(a.expiryDate)
        const expiredB = isExpired(b.expiryDate)
        if (expiredA !== expiredB) return expiredA ? -1 : 1

        // 3. Near Expiry
        const nearA = isNearExpiry(a.expiryDate)
        const nearB = isNearExpiry(b.expiryDate)
        if (nearA !== nearB) return nearA ? -1 : 1

        // 4. Low Confidence overall
        if (a.confidence?.overall === 'low' && b.confidence?.overall !== 'low') return -1
        if (a.confidence?.overall !== 'low' && b.confidence?.overall === 'low') return 1

        // 5. Total count of issues
        return issuesB.length - issuesA.length
      })
      return sorted
    })
    toast.info("Sorted problem rows to the top")
  }

  const handleCreateCompany = async () => {
    const name = newCompany.trim()
    if (!name) return
    setCreatingCompany(true)
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name }),
      })
      const payload = await res.json()
      if (payload.success) {
        toast.success(`Company "${name}" created successfully`)
        setCompanies((prev) => Array.from(new Set([...prev, name])))
        setSelectedCompany(name)
        applyCompanyToRows(name)
        setNewCompany("")
      } else {
        setError(payload.message || "Failed to create company")
        toast.error(payload.message || "Failed to create company")
      }
    } catch {
      setError("Failed to create company")
      toast.error("Network error while creating company")
    } finally {
      setCreatingCompany(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={resetModal}>
      <DialogContent className="max-w-[98vw] w-full h-[100dvh] sm:h-[95vh] max-h-[100dvh] sm:max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-surface border-surface-border transition-all duration-300 rounded-none sm:rounded-lg">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-3 sm:py-4 border-b bg-muted/30 shrink-0">
          <div className="flex flex-col min-w-0">
            <h2 className="text-base sm:text-xl font-bold text-foreground truncate">Review & Validate Bill</h2>
            <p className="hidden sm:block text-xs text-muted-foreground">Confirm extracted data before importing to inventory</p>
          </div>
          <div className="flex gap-2 sm:gap-4 items-center shrink-0">
            {/* Import button lives in the header on desktop; on mobile it moves
                into the sticky bottom action bar instead (see bottom of file)
                so the user never has to scroll up to import. */}
            {step === "preview" && (
              <Button onClick={() => handleImport()} className="hidden lg:flex bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-lg shadow-primary/20" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {forceImport ? "Confirm Import Anyway" : `Import ${parsedMedicines.filter(m => m.action !== 'skip' && m.selected !== false).length} Medicines`}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full h-11 w-11 sm:w-8 sm:h-8 p-0 shrink-0">×</Button>
          </div>
        </div>
        {/* Progress Bar Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b bg-surface-muted/50 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-between min-w-max sm:min-w-0">
            <div className="flex space-x-4 sm:space-x-6">
              <div className={`flex items-center gap-2 whitespace-nowrap ${step === "upload" ? "text-primary font-bold text-sm" : "text-muted-foreground text-sm"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${step === "upload" ? "bg-primary text-primary-foreground" : "bg-surface-muted border border-border"}`}>1</div>
                <span>Upload</span>
              </div>
              <div className="w-8 sm:w-12 border-t border-border my-auto" />
              <div className={`flex items-center gap-2 whitespace-nowrap ${step === "ocr" || (step === "upload" && loading) ? "text-primary font-bold text-sm" : "text-muted-foreground text-sm"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${step === "ocr" || (step === "upload" && loading) ? "bg-primary text-primary-foreground" : "bg-surface-muted border border-border"}`}>2</div>
                <span>Processing</span>
              </div>
              <div className="w-8 sm:w-12 border-t border-border my-auto" />
              <div className={`flex items-center gap-2 whitespace-nowrap ${step === "preview" || step === "importing" ? "text-primary font-bold text-sm" : "text-muted-foreground text-sm"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs shrink-0 ${step === "preview" || step === "importing" ? "bg-primary text-primary-foreground" : "bg-surface-muted border border-border"}`}>3</div>
                <span>Review</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-surface">
        {error && <div className="mb-4"><SmartErrorBanner errorCode={errorCode} message={error} /></div>}

        {/* ── Upload Step ──────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-6 sm:p-8 text-center">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground mb-2">Upload Distributor Price List</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports PDF, Excel (.xlsx), and Images (.png, .jpg)
              </p>
              <Input
                type="file"
                accept=".pdf,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="max-w-xs mx-auto h-12"
              />
            </div>

            {file && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-500 shrink-0" />
                  <span className="text-blue-700 dark:text-blue-400 text-sm break-all">Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              </div>
            )}

            {/* OCR button when scanned PDF detected */}
            {errorCode === "NO_TEXT" && file && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">🔍 Client-Side OCR Available</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Extract text from scanned PDF using your browser. Free — runs on your device.</p>
                  </div>
                  <Button onClick={handleRunOcr} className="h-11 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shrink-0">
                    Run OCR
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OCR Step ──────────────────────────────────────────────── */}
        {step === "ocr" && (
          <div className="space-y-4">
            <div className="py-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">🔍</span>
                <h3 className="text-lg font-medium text-foreground">Running Client-Side OCR</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Extracting text from scanned PDF images. Runs entirely in your browser.
              </p>
              <OcrProgress {...ocrProgress} />
            </div>
          </div>
        )}

        {/* ── Preview Step ─────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            
            {/* ── Upgrade 1: Duplicate Invoice Banner ─────────────────── */}
            {duplicateWarning && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-4 mb-4 shadow-sm animate-in fade-in slide-in-from-top-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-300">Duplicate Invoice Detected</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">{duplicateWarning.message}</p>
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <Button onClick={() => { setForceImport(true); handleImport(true); }} className="h-11 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                        {loading && forceImport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Yes, Import Anyway"}
                      </Button>
                      <Button variant="ghost" onClick={resetModal} className="h-11 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                        Cancel Import
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-green-700 dark:text-green-400 text-sm">
                    Successfully parsed {parsedMedicines.length} medicines
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {pdfType && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      pdfType === "searchable" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                    }`}>
                      {pdfType === "searchable" ? "✅ Searchable PDF" : (provider.includes("ocr") ? "🔍 OCR Extracted" : "🖼️ Vision API Scanned")}
                    </span>
                  )}
                  {provider && (
                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-full font-medium whitespace-nowrap hidden md:inline-block">
                       AI: {provider.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-muted p-4 md:grid-cols-[1.5fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Company (applies to all rows)</label>
                <select
                  value={selectedCompany}
                  onChange={(event) => handleCompanySelect(event.target.value)}
                  className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base"
                >
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Create new company</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={newCompany}
                    onChange={(event) => setNewCompany(event.target.value)}
                    placeholder="Company name"
                    className="h-12 text-base"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateCompany}
                    disabled={!newCompany.trim() || creatingCompany}
                    className="h-12 shrink-0"
                  >
                    {creatingCompany ? "Saving..." : "Create"}
                  </Button>
                </div>
              </div>
            </div>

            {hasBlockingIssues && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                Fix the highlighted rows (missing category/packing or long names) before importing.
              </div>
            )}

              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Extracted Invoices <span className="text-muted-foreground font-normal">({parsedMedicines.length})</span>
                  </h4>
                  <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground bg-surface-muted px-2 py-1 rounded shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    Review highlights: 🔴 Low, 🟡 Med, 🟢 High Confidence
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={sortProblemsFirst} className="h-11 sm:h-8 text-xs font-medium border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50">
                    Sort Problems First ⚠️
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddManualRow} 
                    className="h-11 sm:h-8 text-xs font-medium border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 bg-surface"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Row Manually
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleSelectAll} className="h-11 sm:h-8 text-xs font-medium border-border">
                    {parsedMedicines.every(m => m.selected !== false) ? "Deselect All" : "Select All"}
                  </Button>
                </div>
              </div>

              {/* ── Mobile card list (below lg breakpoint) ─────────────
                  Each medicine renders as a self-contained card instead of a
                  cramped table row. Desktop keeps the original table below,
                  completely unchanged, hidden on small screens via `hidden lg:block`. */}
              <div className="lg:hidden space-y-3 pb-4">
                {parsedMedicines.map((medicine, index) => {
                  const issues = invalidRows[index] || []
                  const duplicate = isDuplicate(medicine)
                  const category = medicine.category || detectCategory(medicine.packing || medicine.name)
                  const packagingOptions = PACKAGING_OPTIONS[category] || []
                  const medKey = `${medicine.name?.toLowerCase()}|${medicine.company?.toLowerCase() || ""}`
                  const rd = restockData[medKey]
                  const restockLabel: "RESTOCK" | "NEW" | "MANUAL" | null = medicine.isManual
                    ? "MANUAL"
                    : rd
                      ? rd.exists
                        ? "RESTOCK"
                        : "NEW"
                      : null

                  return (
                    <MedicineReviewCard
                      key={index}
                      medicine={medicine}
                      index={index}
                      issues={issues}
                      duplicate={duplicate}
                      category={category}
                      packagingOptions={packagingOptions}
                      categoryOptions={CATEGORY_OPTIONS}
                      restockLabel={restockLabel}
                      isExpired={isExpired(medicine.expiryDate)}
                      isNearExpiry={isNearExpiry(medicine.expiryDate)}
                      confClass={getConfClass}
                      onToggleSelected={toggleSelectRow}
                      onChange={(i, field, value) => updateMedicine(i, field as keyof ParsedMedicine, value)}
                      onCategoryChange={handleCategoryChange}
                      onDelete={removeMedicine}
                    />
                  )
                })}
              </div>

              <div className="hidden lg:block border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
              <Table className="min-w-[1200px]">
                <TableHeader className="bg-muted/50 sticky top-0 z-10 border-b">
                  <TableRow className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <TableHead className="w-10 text-center">
                      <input type="checkbox" checked={parsedMedicines.length > 0 && parsedMedicines.every(m => m.selected !== false)} onChange={toggleSelectAll} className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer" />
                    </TableHead>
                    <TableHead className="w-12 text-center text-sm font-bold uppercase tracking-wider text-foreground">#</TableHead>
                    <TableHead className="min-w-[280px] text-sm font-bold uppercase tracking-wider text-foreground">Medicine Name</TableHead>
                    <TableHead className="min-w-[150px] text-sm font-bold uppercase tracking-wider text-foreground">Company</TableHead>
                    <TableHead className="min-w-[130px] text-sm font-bold uppercase tracking-wider text-foreground">Category</TableHead>
                    <TableHead className="min-w-[120px] text-sm font-bold uppercase tracking-wider text-foreground">Packing</TableHead>
                    <TableHead className="min-w-[100px] text-sm font-bold uppercase tracking-wider text-foreground">Batch</TableHead>
                    <TableHead className="min-w-[100px] text-sm font-bold uppercase tracking-wider text-foreground">Expiry</TableHead>
                    <TableHead className="min-w-[90px] text-sm font-bold uppercase tracking-wider text-foreground text-right">MRP</TableHead>
                    <TableHead className="min-w-[90px] text-sm font-bold uppercase tracking-wider text-foreground text-right">PTS</TableHead>
                    <TableHead className="min-w-[80px] text-sm font-bold uppercase tracking-wider text-foreground text-center">Qty</TableHead>
                    <TableHead className="w-[100px] text-sm font-bold uppercase tracking-wider text-foreground text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedMedicines.map((medicine, index) => {
                    const issues = invalidRows[index] || []
                    const duplicate = isDuplicate(medicine)
                    const category = medicine.category || detectCategory(medicine.packing || medicine.name)
                    const packagingOptions = PACKAGING_OPTIONS[category] || []
                    const hasIssues = issues.length > 0
                    return (
                    <TableRow
                      key={index}
                      className={`group transition-colors ${hasIssues ? "bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30" : "hover:bg-surface-muted/80"} ${duplicate ? "opacity-60" : ""} ${medicine.selected === false ? "opacity-50 bg-surface-muted grayscale" : ""} ${medicine.isManual ? "border-l-4 border-l-blue-500 bg-blue-50/20 dark:bg-blue-950/20" : ""}`}
                    >
                      {/* Checkbox */}
                      <TableCell className="text-center py-4">
                        <input type="checkbox" checked={medicine.selected !== false} onChange={() => toggleSelectRow(index)} className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer" />
                      </TableCell>

                      {/* Row number & Restock Badge */}
                      <TableCell className="text-center text-sm text-muted-foreground font-mono py-4">
                        <div>{index + 1}</div>
                        {(() => {
                          const medKey = `${medicine.name?.toLowerCase()}|${medicine.company?.toLowerCase() || ''}`
                          const rd = restockData[medKey]
                          if (medicine.isManual) {
                            return (
                              <div className="mt-1" title="Manually added medicine row">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 whitespace-nowrap">MANUAL</span>
                              </div>
                            )
                          }
                          if (!rd) return null
                          if (rd.exists) {
                            return (
                              <div className="mt-1" title={`In stock: ${rd.currentStock}. Last bought: ${rd.lastPurchasePrice ? '₹'+rd.lastPurchasePrice : 'N/A'}`}>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 whitespace-nowrap">RESTOCK</span>
                              </div>
                            )
                          } else {
                            return (
                              <div className="mt-1" title="New medicine not found in your inventory">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 whitespace-nowrap">NEW</span>
                              </div>
                            )
                          }
                        })()}
                      </TableCell>

                      {/* Medicine Name — prominent */}
                      <TableCell>
                        <Input
                          value={medicine.name}
                          onChange={(event) => updateMedicine(index, "name", event.target.value)}
                          className={`h-8 text-sm font-semibold border ${getConfClass(medicine.confidence?.name)}`}
                          title={medicine.name}
                        />
                        {hasIssues && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {issues.map((issue) => (
                              <span key={issue} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                                {issue}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>

                      {/* Company */}
                      <TableCell>
                        <Input
                          value={medicine.company}
                          onChange={(event) => updateMedicine(index, "company", event.target.value)}
                          className={`h-8 text-xs border ${getConfClass(medicine.confidence?.overall)}`}
                        />
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <select
                          value={category}
                          onChange={(event) => handleCategoryChange(index, event.target.value)}
                          className="h-8 w-full rounded-md border border-border bg-surface px-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary/20"
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      {/* Packing */}
                      <TableCell>
                        <select
                          value={medicine.packing || ""}
                          onChange={(event) => updateMedicine(index, "packing", event.target.value)}
                          className={`h-8 w-full rounded-md border px-2 text-xs ${getConfClass(medicine.confidence?.packing)}`}
                        >
                          <option value="">Select</option>
                          {packagingOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>

                      {/* Batch No */}
                      <TableCell className="font-mono text-sm text-slate-700 py-4">
                        <Input
                          value={medicine.batchNo || ""}
                          onChange={(event) => updateMedicine(index, "batchNo", event.target.value)}
                          className={`h-8 text-xs border ${getConfClass(medicine.confidence?.batch)}`}
                        />
                      </TableCell>

                      {/* Expiry */}
                      <TableCell className="text-sm py-4">
                        <div className="flex flex-col gap-1">
                          <Input
                            value={medicine.expiryDate || ""}
                            onChange={(event) => updateMedicine(index, "expiryDate", event.target.value)}
                            className={`h-8 text-xs border ${getConfClass(medicine.confidence?.expiry)} ${isExpired(medicine.expiryDate) ? "text-red-700 font-bold bg-red-50" : isNearExpiry(medicine.expiryDate) ? "text-amber-700 font-bold bg-amber-50" : ""}`}
                          />
                          {isExpired(medicine.expiryDate) && <span className="text-[10px] font-medium text-red-600 leading-tight">Expired ❌</span>}
                          {isNearExpiry(medicine.expiryDate) && <span className="text-[10px] font-medium text-amber-600 leading-tight">Near Expiry ⚠️</span>}
                        </div>
                      </TableCell>

                      {/* MRP */}
                      <TableCell className="text-right py-4">
                         <Input
                          type="number"
                          value={medicine.mrp || ""}
                          onChange={(e) => updateMedicine(index, "mrp", Number(e.target.value))}
                          className={`h-8 w-20 ml-auto text-xs text-right font-bold border ${getConfClass(medicine.confidence?.mrp)}`}
                        />
                      </TableCell>

                      {/* Purchase Rate */}
                      <TableCell className="text-right py-4">
                         <Input
                          type="number"
                          value={medicine.purchaseRate ?? medicine.tradePrice ?? ""}
                          onChange={(e) => updateMedicine(index, "purchaseRate", Number(e.target.value))}
                          className={`h-8 w-16 ml-auto text-xs text-right font-bold border border-border`}
                        />
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-center py-4">
                        <Input
                          type="number"
                          value={medicine.quantity || ""}
                          onChange={(e) => updateMedicine(index, "quantity", Number(e.target.value))}
                          className={`h-10 w-20 mx-auto text-sm text-center font-bold border-2 ${getConfClass(medicine.confidence?.quantity)}`}
                        />
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-center group">
                        <div className="flex justify-center gap-1">
                          {duplicate ? (
                            <select
                              value={medicine.action || "skip"}
                              onChange={(event) =>
                                updateMedicine(index, "action", event.target.value as any)
                              }
                              className="h-7 w-20 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-1 text-[10px] font-medium text-amber-800 dark:text-amber-300 focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="skip">Skip</option>
                              <option value="update">Update</option>
                            </select>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMedicine(index)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete Row"
                            >
                              <AlertCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Importing medicines...</p>
          </div>
        )}
        </div>

        {/*
          This footer sits OUTSIDE the scrollable content div above (it is a
          flex sibling in a flex-col container with the content area being
          the only `flex-1 overflow-y-auto` region). That means it is already
          pinned to the bottom of the dialog and stays visible while the
          medicine list scrolls — satisfying the "sticky action bar, never
          scroll back up to Save/Import/Cancel" requirement — on both mobile
          and desktop, with no extra positioning needed.
        */}
        <DialogFooter className="border-t border-border bg-surface-muted p-3 sm:p-6 shrink-0 flex flex-row items-center justify-between w-full gap-2">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={resetModal} className="h-11 sm:h-10">
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || loading}
                className="h-11 sm:h-10 bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? "Processing..." : "Upload & Preview"}
              </Button>
            </>
          )}

          {step === "ocr" && (
            <Button disabled className="h-11 sm:h-10 bg-blue-600 text-white w-full sm:w-auto">
              OCR Running...
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")} className="h-11 sm:h-10 shrink-0">
                Back
              </Button>
              <Button
                onClick={() => handleImport()}
                disabled={
                  parsedMedicines.filter((row) => row.action !== "skip" && row.selected !== false).length === 0 ||
                  hasBlockingIssues ||
                  loading
                }
                className="h-11 sm:h-10 flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {loading
                  ? "Importing..."
                  : forceImport
                    ? "Confirm Import Anyway"
                    : `Import ${parsedMedicines.filter((row) => row.action !== "skip" && row.selected !== false).length} Medicines`}
              </Button>
            </>
          )}

          {step === "importing" && (
            <Button disabled className="h-11 sm:h-10 w-full sm:w-auto">
              Importing...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
