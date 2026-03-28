# Implementation Plan - Robust Import Fixes

Addressing AI timeouts for scanned PDFs and improving frontend resilience during background processing.

## Proposed Changes

### [Backend] PDF Text Detection
Prevent unnecessary AI processing for non-searchable PDFs.

#### [MODIFY] [import route](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/medicines/import/route.ts)
- Integrate `pdf-parse` to extract text from the uploaded PDF buffer.
- Implement a threshold check (e.g., < 50 chars).
- Return an early 400 response with a user-friendly message for scanned PDFs.

### [Frontend] Resilient Polling & UX
Ensure users see results even if network-level errors occur during polling.

#### [MODIFY] [ImportMedicinesModal]
- Update polling catch block to retry status check after a 5-second delay.
- Add a "Check Import Status" manual button to the loading state.
- Implement immediate redirection to the medicines list upon successful database save, bypassing the review step if redundant.

## Verification Plan

### Automated Tests
- Verify PDF text extraction logic with sample files (searchable vs scanned).
- `npm run lint` & `npm run build`.

### Manual Verification
- Upload a scanned PDF and verify the "Run OCR" warning.
- Simulate a network disconnect during polling and verify the 5s retry logic.
- Confirm successful redirection and toast notification after medicine import.
