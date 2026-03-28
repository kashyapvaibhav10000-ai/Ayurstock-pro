# PDF Import Improvements — Implementation Plan

Improve the PDF import system with **client-side OCR** (free, no API costs), better error handling, batch processing UI, and AI parsing optimization.

## Key Design Decision: Client-Side OCR

Instead of a paid OCR API, we run OCR **in the user's browser** using libraries already in `package.json`:

- **`pdfjs-dist`** renders PDF pages to canvas images — works perfectly in browsers (DOMMatrix error was server-only)
- **`tesseract.js`** performs OCR on those images — works great in browsers (timeout was server-only)
- **No Vercel timeout** — browser has no 60-second limit
- **No API costs** — everything runs locally
- **No new dependencies needed**

**Flow:** Browser extracts text → if empty, browser OCRs pages → sends text to server → server AI-parses only

---

## Proposed Changes

### Component 1: Client-Side OCR Utility

#### [NEW] [pdfOcrClient.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/pdfOcrClient.ts)

Client-side utility that:
1. Uses `pdfjs-dist` to render each PDF page to a canvas
2. Uses `tesseract.js` to OCR each page image
3. Returns combined extracted text
4. Reports progress via callback: `onProgress({ phase, page, totalPages, percent })`
5. Handles errors gracefully with descriptive messages

---

### Component 2: Structured Backend Error Handling

#### [MODIFY] [aiParser.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/aiParser.ts)

- Add `ParseResult` type: `{ medicines, pdfType, error?, errorCode? }`
- `parsePDFWithAI()` returns `ParseResult` instead of raw array
- Error codes: `NO_TEXT`, `EMPTY_AFTER_CLEAN`, `AI_FAILED`, `TIMEOUT`

#### [MODIFY] [route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/medicines/import/route.ts)

- Accept both file upload AND pre-extracted text (from client OCR)
- New field: `extractedText` in form data — if present, skip pdf2json and use this text directly
- Return `errorCode` and `pdfType` in response

#### [MODIFY] [route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/medicine/import-price-list/route.ts)

- Same: accept `extractedText` field alongside file upload

---

### Component 3: Smart UI with OCR Integration

#### [MODIFY] [ImportMedicinesModal.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/components/ImportMedicinesModal.tsx)

- **Upload flow redesigned:**
  1. User uploads PDF → sends to server (normal flow)
  2. If server returns `errorCode: 'NO_TEXT'` → show "Scanned PDF detected" with **"Run OCR"** button
  3. User clicks "Run OCR" → runs client-side OCR with progress bar (page X of Y)
  4. OCR completes → sends extracted text to server for AI parsing
- **New processing UI states:** "Extracting text..." → "Running OCR (page 2/5)..." → "AI parsing..."
- **Smart error banners** with icons and actionable guidance

#### [MODIFY] [import-price-list.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/components/medicine/import-price-list.tsx)

- Same OCR integration and error handling improvements

---

### Component 4: Batch Processing UI (Medium Impact)

#### [NEW] [route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/medicines/import/batch/route.ts)

- POST: Save OCR'd text + PDF metadata to `PdfImportJob` table
- GET: List batch jobs for current shop

#### [NEW] [route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/medicines/import/batch/[id]/route.ts)

- GET: Fetch job status/results
- PATCH: Re-process a failed job

#### [MODIFY] [ImportMedicinesModal.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/components/ImportMedicinesModal.tsx)

- "Save for Later" button to queue jobs
- Batch job history panel

---

### Component 5: AI Parsing Optimization (Medium Impact)

#### [MODIFY] [aiParser.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/aiParser.ts)

- 2-line overlap between chunks to prevent splitting medicines at boundaries
- Split on blank lines between medicine groups instead of fixed char count
- Cap at 100 pages with clear error

---

## Verification Plan

1. **Searchable PDF** → normal flow, parses correctly
2. **Scanned PDF** → server returns "no text" → user clicks "Run OCR" → browser OCRs → results appear
3. **OCR progress** → progress bar updates per page during OCR
4. **Error messages** → clear guidance for each failure scenario
5. **Build check** → `npm run build` passes
