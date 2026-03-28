# AyurStock Pro — Full Software Audit Report

**Date**: March 17, 2026 | **Scope**: Full codebase review (35 API routes, 14 DB models, all pages & components)

---

## ✅ PROS — What's Working Well

### Architecture & Schema
- **Solid Prisma schema**: 14 well-indexed models with proper relations, cascading deletes, and unique constraints
- **Multi-tenant design**: Every model is scoped by `shopId`, preventing cross-tenant data leaks
- **FEFO billing**: The billing service correctly uses First-Expiry-First-Out batch allocation with stock ledger tracking
- **Transactional billing**: `createSale` runs inside `prisma.$transaction()` — atomic stock updates prevent overselling

### Security
- **Zod validation on all inputs**: Every API route validates request bodies via schemas in `lib/schemas.ts`
- **JWT + HttpOnly cookie**: Auth tokens are set as `httpOnly`, `sameSite: lax`, `secure` in production
- **API-level RBAC**: Sales route checks user role before allowing operations
- **Middleware route protection**: All `/dashboard/*` routes redirect to `/login` if no token is present

### Code Quality
- **Strong TypeScript types**: `types/index.ts` defines clear DTOs for Medicine, Batch, Cart, Billing, Reports
- **Separated concerns**: API routes → services (`billing.ts`) → Prisma — clean layering
- **Activity logging**: Every sale is logged to `ActivityLog` with metadata

### UI/UX
- **Modern SaaS design**: Consistent emerald palette, `Inter` font, rounded cards, micro-interactions
- **Global toast system**: `sonner` used everywhere instead of `alert()`
- **Mobile-responsive dashboard**: Hamburger menu, collapsible sidebar, responsive grid layouts
- **RBAC-aware navigation**: Sidebar dynamically hides links based on user role

---

## 🟡 CONS — Weaknesses & Technical Debt

### 1. 🔐 Security Issues

| Issue | Severity | Location |
|---|---|---|
| **JWT secret fallback to hardcoded string** | 🔴 Critical | [auth.ts:L7](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/auth.ts#L7) — `'dev-secret-key-change-in-production'` is used if env var is missing |
| **Debug logs leak sensitive data in production** | 🔴 Critical | [auth.ts:L27-32](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/auth.ts#L27-L32) — Token substrings, JWT_SECRET status, and user emails logged |
| **Login route leaks user info in logs** | 🟠 High | [login/route.ts:L31-44](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/api/auth/login/route.ts#L31-L44) — `console.log('Password valid:', ...)` |
| **Middleware does NOT verify JWT** | 🔴 Critical | [middleware.ts](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/middleware.ts) — Only checks if cookie *exists*, not if token is *valid* |
| **15-minute token with no refresh mechanism** | 🟠 High | [auth.ts:L8](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/auth.ts#L8) — Users get logged out every 15 min with no silent refresh |
| **No rate limiting on login endpoint** | 🟠 High | Brute force attacks are possible |
| **`@prisma/client` in devDependencies** | 🟡 Medium | [package.json:L57](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/package.json#L57) — Will break production builds on some hosts |

### 2. 🐛 Functional Bugs

| Bug | Severity | Location |
|---|---|---|
| **Dashboard metrics are hardcoded/simulated** | 🔴 Critical | [dashboard/page.tsx:L37-51](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/dashboard/page.tsx#L37-L51) — Uses `setTimeout` with fake data instead of API call |
| **`CreateSaleSchema` allows nullable `batchId`** | 🟠 High | [schemas.ts:L149](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/lib/schemas.ts#L149) — `batchId: z.string().optional().nullable()` can cause billing failures |
| **Billing walk-in phone validation mismatch** | 🟡 Medium | [billing/page.tsx:L210](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/dashboard/billing/page.tsx#L210) — Sends `'0000000000'` but `CreateCustomerSchema` requires `min(10)` — currently bypasses schema |
| **No stock quantity validation on cart** | 🟡 Medium | [billing/page.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/dashboard/billing/page.tsx) — Users can set quantity > available stock in cart; failure only at checkout |
| **`User.email` is not globally unique** | 🟡 Medium | [schema.prisma:L104](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/prisma/schema.prisma#L104) — `@@unique([shopId, email])` only, so same email can exist across shops but `findFirst({email})` in login will find the wrong one |
| **`getSaleDetails` has no shopId filter** | 🟡 Medium | [billing.ts:L327](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/services/billing.ts#L327) — Any authenticated user can view any sale by ID (cross-tenant) |
| **Suppliers page is an empty state** | 🟡 Medium | [suppliers/page.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/dashboard/suppliers/page.tsx) — Despite having a full API, the page only shows "Coming Soon" |
| **Reports page shows no real data** | 🟡 Medium | [reports/page.tsx](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/app/dashboard/reports/page.tsx) — `hasData` is hardcoded to `false` |

### 3. 🏗️ Architecture Issues

| Issue | Severity | Details |
|---|---|---|
| **Duplicate PDF libraries** | 🟡 Medium | `pdf-parse`, `pdf-to-img`, `pdf2json`, `pdf2pic`, `pdfjs-dist` — 5 PDF libraries in `package.json` |
| **Socket.io imported but unused** | 🟡 Medium | `socket.io` + `socket.io-client` in deps; `lib/socket-client.ts` is 2 lines with no real code |
| **No ESLint config file** | 🟡 Medium | `npm run lint` prompts for setup every time — no `.eslintrc` exists |
| **`ImportJob` and `PdfImportJob` models overlap** | 🟡 Medium | Two separate import job models in schema that serve similar purposes |
| **No error boundary component** | 🟡 Medium | A crash in any page component will crash the entire app |
| **No loading/error states on Settings sub-components** | 🟡 Low | Individual settings panels show no skeleton while fetching data |
| **Client-side RBAC only** | 🟠 High | Page-level RBAC is client-side only (redirect in `useEffect`); API routes don't consistently check roles for all operations |

### 4. 📱 UX/UI Gaps

| Issue | Details |
|---|---|
| **No "Forgot Password" flow** | Login page has no recovery option |
| **No pagination on Medicines/Inventory pages** | Large datasets will slow down the browser |
| **No search on Billing history** | Can't look up past invoices easily |
| **No confirmation dialogs for destructive actions** | Delete actions fire immediately |
| **No keyboard shortcut legend visible on mobile** | Billing shortcuts (F1, F7, F12) only shown on desktop |
| **No offline/network error handling** | If API is down, pages show nothing — no retry or offline indicator |

---

## 🔴 TOP 5 THINGS TO FIX IMMEDIATELY

> [!CAUTION]
> These are production-blocking issues that must be resolved before any real customer data goes through the system.

1. **Remove all `console.log` debug statements from `auth.ts` and `login/route.ts`** — they leak passwords, tokens, and emails in production logs
2. **Verify JWT in middleware, not just cookie existence** — currently any random string in the cookie bypasses middleware
3. **Remove the hardcoded JWT secret fallback** — if `JWT_SECRET` env var is missing, the app should crash, not silently use an insecure key
4. **Connect Dashboard metrics to the real API** — the `setTimeout` with zeroed data is misleading and makes the app look broken
5. **Add `shopId` filter to `getSaleDetails`** — currently a cross-tenant data leak vulnerability

---

## 📊 Codebase Health Score

| Category | Score | Notes |
|---|---|---|
| **Schema & Data Model** | 9/10 | Excellent multi-tenant design, proper indexing |
| **API Security** | 4/10 | Good Zod validation, but critical JWT and RBAC gaps |
| **UI/UX** | 7/10 | Modern and clean, but missing key flows |
| **Code Quality** | 7/10 | Good TypeScript, but orphaned packages and no linting |
| **Production Readiness** | 3/10 | Debug logs, hardcoded data, no error boundaries |
| **Overall** | **6/10** | Solid foundation, but needs hardening before real deployment |
