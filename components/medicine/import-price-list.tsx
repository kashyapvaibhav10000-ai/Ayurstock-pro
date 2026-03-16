"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, CheckCircle, Upload } from "lucide-react"

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
  category?: string
  hsn?: string
  barcode?: string
  rackLocation?: string
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
  const [step, setStep] = useState<"upload" | "ocr" | "preview" | "importing">("upload")
  const [companies, setCompanies] = useState<string[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>("")
  const [newCompany, setNewCompany] = useState<string>("")
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set())
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [ocrProgress, setOcrProgressState] = useState({ phase: "loading", page: 0, totalPages: 0, percent: 0, message: "" })
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
    if (!file) return

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
        setPdfType(result.pdfType || "searchable")
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
      } else {
        setErrorCode(result.errorCode || "")
        setError(result.message || "Failed to parse file")
      }
    } catch (err) {
      setError("Failed to upload file. Please try again.")
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
        setPdfType("scanned")
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
        setStep("upload")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR processing failed")
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
        onSuccess(result.count)
        onClose()
        setStep("upload")
        setFile(null)
        setParsedMedicines([])
      } else {
        setError(result.message || "Failed to import medicines")
        setStep("preview")
      }
    } catch (err) {
      setError("Failed to import medicines. Please try again.")
      setStep("preview")
    } finally {
      setLoading(false)
    }
  }

  const removeMedicine = (index: number) => {
    setParsedMedicines(prev => prev.filter((_, i) => i !== index))
  }

  const updateMedicine = (index: number, field: keyof ParsedMedicine, value: string) => {
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
        setCompanies((prev) => Array.from(new Set([...prev, name])))
        setSelectedCompany(name)
        applyCompanyToRows(name)
        setNewCompany("")
      } else {
        setError(payload.message || "Failed to create company")
      }
    } catch {
      setError("Failed to create company")
    } finally {
      setCreatingCompany(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={resetModal}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Distributor Price List
          </DialogTitle>
        </DialogHeader>

        {error && <SmartErrorBanner errorCode={errorCode} message={error} />}

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
                {pdfType && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    pdfType === "searchable" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {pdfType === "searchable" ? "✅ Searchable PDF" : "🔍 Scanned (OCR)"}
                  </span>
                )}
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

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Packing</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead>Trade</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>HSN</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedMedicines.map((medicine, index) => {
                    const issues = invalidRows[index] || []
                    const duplicate = isDuplicate(medicine)
                    const category = medicine.category || detectCategory(medicine.packing || medicine.name)
                    const packagingOptions = PACKAGING_OPTIONS[category] || []
                    return (
                    <TableRow key={index} className={issues.length > 0 ? "bg-red-50" : undefined}>
                      <TableCell className="font-medium">{medicine.code || "-"}</TableCell>
                      <TableCell className="font-medium">
                        <Input
                          value={medicine.name}
                          onChange={(event) => updateMedicine(index, "name", event.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={medicine.company}
                          onChange={(event) => updateMedicine(index, "company", event.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={medicine.packing || ""}
                          onChange={(event) => updateMedicine(index, "packing", event.target.value)}
                          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                          <option value="">Select</option>
                          {packagingOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>{medicine.mrp ? `₹${medicine.mrp}` : "-"}</TableCell>
                      <TableCell>{medicine.tradePrice ? `₹${medicine.tradePrice}` : "-"}</TableCell>
                      <TableCell>
                        <select
                          value={category}
                          onChange={(event) => handleCategoryChange(index, event.target.value)}
                          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="space-y-1 text-xs text-red-700">
                            {issues.map((issue) => (
                              <div key={issue}>{issue}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">OK</span>
                        )}
                      </TableCell>
                      <TableCell>{medicine.hsn || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          {duplicate ? (
                            <select
                              value={medicine.action || "skip"}
                              onChange={(event) =>
                                updateMedicine(index, "action", event.target.value)
                              }
                              className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                            >
                              <option value="skip">Skip</option>
                              <option value="update">Update</option>
                            </select>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeMedicine(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Importing medicines...</p>
          </div>
        )}

        <DialogFooter>
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
