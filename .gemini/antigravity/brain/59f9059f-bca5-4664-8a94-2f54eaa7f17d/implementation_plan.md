# Import Bill — 7 Upgrades Implementation Plan

## Overview
Upgrade the Import Bill feature with duplicate detection, validation, partial accept/reject, expiry warnings, restock detection, confidence scoring, and OCR-first processing.

---

## Proposed Changes

### Database Schema

#### [MODIFY] [schema.prisma](file:///c:/Users/vaibh/Documents/Ayur-stock pro/prisma/schema.prisma)
- Add `ImportedInvoice` model for duplicate checking:
  - `shopId`, `invoiceNumber`, `supplierName`, `importedAt`, `medicineCount`, `totalStock`
  - Unique constraint: `shopId + invoiceNumber + supplierName`

---

### Backend APIs

#### [MODIFY] [bulk-import/route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock pro/app/api/medicine/bulk-import/route.ts)
- **Upgrade 1:** Before saving, check `ImportedInvoice` for duplicate. Return `isDuplicate` warning if found.
- **Upgrade 2:** Validate each row before insert (expiry future, qty > 0, mrp > 0, mrp >= purchaseRate, name not empty). Return `validationErrors[]` in response.
- After successful import, create an `ImportedInvoice` record.

#### [MODIFY] [import-price-list/route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock pro/app/api/medicine/import-price-list/route.ts)
- **Upgrade 7:** Before sending to vision API, try Tesseract.js OCR first. If OCR returns >100 chars, send to text LLM. Otherwise fall back to vision API.

#### [NEW] [check-restock/route.ts](file:///c:/Users/vaibh/Documents/Ayur-stock pro/app/api/medicine/check-restock/route.ts)
- **Upgrade 5:** Accept `medicines[]` array, return inventory status for each (exists, currentStock, lastPurchasePrice).

---

### Frontend

#### [MODIFY] [import-price-list.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock pro/components/medicine/import-price-list.tsx)
- **Upgrade 1:** Show duplicate invoice warning banner + "Import Anyway" / "Cancel" buttons.
- **Upgrade 2:** Show validation errors per row (red highlights, error count).
- **Upgrade 3:** Add checkboxes per row, Select All/Deselect All, "Import Selected" button, auto-uncheck invalid rows.
- **Upgrade 4:** Highlight near-expiry (yellow, ⚠️) and expired (red, ❌) rows. Sort problems first. Show expiry summary.
- **Upgrade 5:** Show RESTOCK (green) and NEW (blue) badges. Tooltip with stock/price comparison.
- **Upgrade 6:** Show confidence indicators per cell (🟢/🟡/🔴 backgrounds).

---

### AI Parser

#### [MODIFY] [aiParser.ts](file:///c:/Users/vaibh/Documents/Ayur-stock pro/lib/aiParser.ts)
- **Upgrade 6:** Add `confidence` field to `ParsedMedicine` interface. Vision prompt updated to return confidence levels per field.

---

## Verification Plan

### Automated
- `npx prisma db push && npx prisma generate`
- `npm run build` with 0 errors

### Manual
- Deploy, test Import Bill with the Ayukalp invoice photo
- Verify duplicate warning, validation errors, checkboxes, expiry highlights, restock badges all render correctly

---

> [!IMPORTANT]
> This is a large change touching ~5 files. The implementation order is: Schema → Backend (Upgrades 1,2) → Frontend (Upgrades 3,4,5,6) → OCR Split (Upgrade 7).
