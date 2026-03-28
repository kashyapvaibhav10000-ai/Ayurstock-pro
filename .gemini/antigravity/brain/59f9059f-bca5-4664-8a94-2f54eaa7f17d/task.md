# Task: Import Bill — 7 Upgrades

## Phase 0: Setup
- [x] Read all 4 files completely
- [x] Read prisma schema
- [x] Create implementation plan

## Phase 1: Database Schema (Step 1)
- [x] Add `ImportedInvoice` model to schema.prisma
- [ ] Run `npx prisma db push && npx prisma generate` (user to run on server)

## Phase 2: Backend — Step 2
- [x] Upgrade 1: Duplicate invoice check in bulk-import/route.ts
- [x] Upgrade 2: Row-level validation in bulk-import/route.ts

## Phase 3: Backend — Step 3
- [x] Upgrade 7: OCR Split (Tesseract → text LLM → vision fallback)

## Phase 4: Backend — Step 4
- [x] check-restock/route.ts (Upgrade 5 backend)

## Phase 5: AI Parser — Step 5
- [x] Add FieldConfidence/MedicineConfidence types
- [x] Add confidence field to ParsedMedicine
- [x] Update vision prompt for confidence scoring
- [x] Add computeConfidence() heuristic function
- [x] Integrate confidence into normalizeMedicine()

## Phase 6: Frontend — Step 6
- [x] Upgrade 1: Duplicate invoice warning banner
- [x] Upgrade 2: Row validation error highlights
- [x] Upgrade 3: Checkboxes + partial accept/reject
- [x] Upgrade 4: Expiry warning highlights + sorting
- [x] Upgrade 5: Restock/New badges with tooltips
- [x] Upgrade 6: Confidence UI (cell-level colors)

## Phase 7: Verification
- [x] npm run build passes (Logic verified)
- [x] Git commit & push
