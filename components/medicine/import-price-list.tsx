"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, CheckCircle, Upload, FileText, Loader2, Play, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

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
    <div className={`rounded-lg p-4 flex items-start gap-3 ${isScanned ? "bg-amber-50 border border-amber-300" : "bg-red-50 border border-red-200"}`}>
      {isScanned ? <span className="text-xl">📄</span> : <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
      <div className="space-y-1">
        <span className={`text-sm font-medium ${isScanned ? "text-amber-800" : "text-red-700"}`}>{message}</span>
        {guidance && <p className={`text-xs ${isScanned ? "text-amber-600" : "text-red-500"}`}>{guidance}</p>}
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
        <span className="font-medium text-gray-700">
          {phase === "loading" ? "📖 Loading PDF..." :
           phase === "rendering" ? `🖼️ Rendering page ${page}/${totalPages}` :
           phase === "ocr" ? `🔍 OCR page ${page}/${totalPages}` :
           phase === "done" ? "✅ OCR complete!" : message}
        </span>
        <span className="text-gray-500">{percent}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-gray-500">{message}</p>
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
          return { ...row, category, packing }
        })
        setParsedMedicines(normalized)
        setSelectedCompany("")
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
          return { ...row, category, packing }
        })
        setParsedMedicines(normalized)
        setSelectedCompany("")
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

  const handleImport = async () => {
    setStep("importing")
    setLoading(true)

    try {
      const payloadRows = parsedMedicines.filter((row) => row.action !== "skip")
      const response = await fetch("/api/medicine/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ medicines: payloadRows }),
      })

      const result = await response.json()

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
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-surface border-surface-border">
        <DialogHeader className="px-6 py-4 border-b border-surface-border bg-slate-50 shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Bill
          </DialogTitle>
          <div className="flex items-center justify-between mt-4">
            <div className="flex space-x-6">
              <div className={`flex items-center gap-2 ${step === "upload" ? "text-primary font-bold" : "text-text-secondary"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === "upload" ? "bg-primary text-white" : "bg-slate-200"}`}>1</div>
                <span>Upload</span>
              </div>
              <div className="w-12 border-t-2 border-slate-200 my-auto" />
              <div className={`flex items-center gap-2 ${step === "ocr" || (step === "upload" && loading) ? "text-primary font-bold" : "text-text-secondary"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === "ocr" || (step === "upload" && loading) ? "bg-primary text-white" : "bg-slate-200"}`}>2</div>
                <span>Processing</span>
              </div>
              <div className="w-12 border-t-2 border-slate-200 my-auto" />
              <div className={`flex items-center gap-2 ${step === "preview" ? "text-primary font-bold" : "text-text-secondary"}`}>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${step === "preview" ? "bg-primary text-white" : "bg-slate-200"}`}>3</div>
                <span>Review</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-surface">
        {error && <div className="mb-4"><SmartErrorBanner errorCode={errorCode} message={error} /></div>}

        {/* ── Upload Step ──────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">Upload Distributor Price List</p>
              <p className="text-sm text-gray-500 mb-4">
                Supports PDF, Excel (.xlsx), and Images (.png, .jpg)
              </p>
              <Input
                type="file"
                accept=".pdf,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="max-w-xs mx-auto"
              />
            </div>

            {file && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-500" />
                  <span className="text-blue-700">Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              </div>
            )}

            {/* OCR button when scanned PDF detected */}
            {errorCode === "NO_TEXT" && file && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">🔍 Client-Side OCR Available</p>
                    <p className="text-xs text-blue-600 mt-1">Extract text from scanned PDF using your browser. Free — runs on your device.</p>
                  </div>
                  <Button onClick={handleRunOcr} className="bg-blue-600 hover:bg-blue-700 text-white ml-4">
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
                <h3 className="text-lg font-medium text-gray-700">Running Client-Side OCR</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Extracting text from scanned PDF images. Runs entirely in your browser.
              </p>
              <OcrProgress {...ocrProgress} />
            </div>
          </div>
        )}

        {/* ── Preview Step ─────────────────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-green-700">
                    Successfully parsed {parsedMedicines.length} medicines
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {pdfType && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      pdfType === "searchable" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {pdfType === "searchable" ? "✅ Searchable PDF" : "🔍 Scanned (OCR)"}
                    </span>
                  )}
                  {provider && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full font-medium whitespace-nowrap">
                      {provider === 'gemini' ? 'Processed by Google Gemini ✓' : provider === 'groq' ? 'Processed by Groq ✓' : 'Processed by OpenRouter (slow mode) ✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.5fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Company (applies to all rows)</label>
                <select
                  value={selectedCompany}
                  onChange={(event) => handleCompanySelect(event.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
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
                <label className="text-sm font-medium text-slate-700">Create new company</label>
                <div className="flex gap-2">
                  <Input
                    value={newCompany}
                    onChange={(event) => setNewCompany(event.target.value)}
                    placeholder="Company name"
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateCompany}
                    disabled={!newCompany.trim() || creatingCompany}
                  >
                    {creatingCompany ? "Saving..." : "Create"}
                  </Button>
                </div>
              </div>
            </div>

            {hasBlockingIssues && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Fix the highlighted rows (missing category/packing or long names) before importing.
              </div>
            )}

            <div className="border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <TableHeader className="bg-slate-100 sticky top-0 z-10">
                  <TableRow className="border-b-2 border-slate-200">
                    <TableHead className="w-8 text-center text-xs font-bold uppercase tracking-wider text-slate-500">#</TableHead>
                    <TableHead className="min-w-[220px] text-xs font-bold uppercase tracking-wider text-slate-500">Medicine Name</TableHead>
                    <TableHead className="min-w-[130px] text-xs font-bold uppercase tracking-wider text-slate-500">Company</TableHead>
                    <TableHead className="min-w-[110px] text-xs font-bold uppercase tracking-wider text-slate-500">Category</TableHead>
                    <TableHead className="min-w-[100px] text-xs font-bold uppercase tracking-wider text-slate-500">Packing</TableHead>
                    <TableHead className="min-w-[80px] text-xs font-bold uppercase tracking-wider text-slate-500">Batch</TableHead>
                    <TableHead className="min-w-[70px] text-xs font-bold uppercase tracking-wider text-slate-500">Expiry</TableHead>
                    <TableHead className="min-w-[75px] text-xs font-bold uppercase tracking-wider text-slate-500 text-right">MRP</TableHead>
                    <TableHead className="min-w-[75px] text-xs font-bold uppercase tracking-wider text-slate-500 text-right">PTS</TableHead>
                    <TableHead className="min-w-[65px] text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Qty</TableHead>
                    <TableHead className="w-[80px] text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Action</TableHead>
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
                      className={`group transition-colors ${hasIssues ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50/80"} ${duplicate ? "opacity-60" : ""}`}
                    >
                      {/* Row number */}
                      <TableCell className="text-center text-xs text-slate-400 font-mono">{index + 1}</TableCell>

                      {/* Medicine Name — prominent */}
                      <TableCell>
                        <Input
                          value={medicine.name}
                          onChange={(event) => updateMedicine(index, "name", event.target.value)}
                          className="h-8 text-sm font-semibold border-slate-200 focus:border-primary focus:ring-primary/20"
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
                          className="h-8 text-xs border-slate-200"
                        />
                      </TableCell>

                      {/* Category */}
                      <TableCell>
                        <select
                          value={category}
                          onChange={(event) => handleCategoryChange(index, event.target.value)}
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary/20"
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
                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary/20"
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
                      <TableCell className="font-mono text-xs text-slate-600">{medicine.batchNo || "—"}</TableCell>

                      {/* Expiry */}
                      <TableCell className="text-xs text-slate-600">{medicine.expiryDate || "—"}</TableCell>

                      {/* MRP */}
                      <TableCell className="text-right font-mono text-xs font-medium text-slate-700">
                        {medicine.mrp ? `₹${Number(medicine.mrp).toFixed(2)}` : "—"}
                      </TableCell>

                      {/* Purchase Rate */}
                      <TableCell className="text-right font-mono text-xs font-medium text-slate-700">
                        {medicine.purchaseRate ? `₹${Number(medicine.purchaseRate).toFixed(2)}` : (medicine.tradePrice ? `₹${Number(medicine.tradePrice).toFixed(2)}` : "—")}
                      </TableCell>

                      {/* Qty */}
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={medicine.quantity || ""}
                          onChange={(event) => updateMedicine(index, "quantity", Number(event.target.value))}
                          className="h-8 w-16 mx-auto text-xs text-center border-slate-200"
                        />
                      </TableCell>

                      {/* Action */}
                      <TableCell className="text-center">
                        {duplicate ? (
                          <select
                            value={medicine.action || "skip"}
                            onChange={(event) =>
                              updateMedicine(index, "action", event.target.value)
                            }
                            className="h-7 w-full rounded border border-amber-300 bg-amber-50 px-1 text-[10px] font-medium text-amber-800"
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update</option>
                          </select>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMedicine(index)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Remove"
                          >
                            ✕
                          </Button>
                        )}
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
            <p className="text-gray-600">Importing medicines...</p>
          </div>
        )}
        </div>

        <DialogFooter className="border-t border-surface-border bg-slate-50 p-6 shrink-0 flex items-center justify-between w-full">
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={resetModal}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!file || loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? "Processing..." : "Upload & Preview"}
              </Button>
            </>
          )}

          {step === "ocr" && (
            <Button disabled className="bg-blue-600 text-white">
              OCR Running...
            </Button>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  parsedMedicines.filter((row) => row.action !== "skip").length === 0 ||
                  hasBlockingIssues ||
                  loading
                }
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? "Importing..." : `Import ${parsedMedicines.filter((row) => row.action !== "skip").length} Medicines`}
              </Button>
            </>
          )}

          {step === "importing" && (
            <Button disabled>
              Importing...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
