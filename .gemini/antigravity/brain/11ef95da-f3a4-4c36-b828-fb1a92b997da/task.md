# Task Management

- [ ] PDF Detection (Backend)
    - [ ] Add `pdf-parse` check in `app/api/medicines/import/route.ts`
    - [ ] Implement text length validation (< 50 chars)
    - [ ] Return early error for scanned PDFs
- [ ] Resilient Polling (Frontend)
    - [ ] Identify `ImportMedicinesModal` location
    - [ ] Update polling logic with 5s retry on network error
    - [ ] Add manual "Check Import Status" button
    - [ ] Implement redirect to medicines page after save
- [ ] Final Verification
    - [ ] `npm run lint`
    - [ ] `npm run build`
    - [ ] Git commit and push
