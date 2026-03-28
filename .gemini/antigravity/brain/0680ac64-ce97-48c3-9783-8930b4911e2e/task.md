# Fix PDF Import Failures

## Issues
- Small PDF (7 pages, 2.37 KB) → 400 error "AI returned Invalid JSON" after 5 retries
- Large PDF (9.4 MB) → 504 error (Vercel 300s timeout)

## Tasks
- [/] Investigate root cause of both failures
- [ ] Fix `aiParser.ts` - reduce overhead and improve robustness
  - [ ] Reduce `findWorkingModel` probing overhead (cuts 10-80s of wasted time)
  - [ ] Add model fallback during chunk parsing (not just during probe)
  - [ ] Improve JSON extraction to handle more AI response edge cases
  - [ ] Reduce chunk size and max_tokens for faster responses
  - [ ] Sequential chunk processing for small PDFs, parallel for large
- [ ] Add `vercel.json` with `maxDuration: 300` for the import route
- [ ] Fix `next.config.js` to set serverComponentsExternalPackages
- [ ] Test with deployment
