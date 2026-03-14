# AyurStock Pro - Documentation Index

## Start Here 👇

### 1. **SETUP.md** - Quick Start (5 minutes)
**Read this first!** Step-by-step guide to get the application running locally.
- Install dependencies
- Configure database
- Create demo data
- Start development server
- Login with demo credentials

### 2. **README.md** - Project Overview
Complete project description, features, tech stack, and workflows.
- What is AyurStock Pro?
- Core features explained
- Tech stack rationale
- Multi-tenant architecture
- Database schema overview

### 3. **ARCHITECTURE.md** - System Design (Advanced)
Deep dive into how the system is built and why design choices were made.
- System architecture diagram
- Data flow for billing
- Multi-tenancy implementation
- FEFO (First Expiry First Out) logic
- RBAC (Role-Based Access Control) matrix
- Database optimization
- Authentication flow

### 4. **API.md** - API Reference
Complete API documentation with examples.
- Authentication endpoints
- Medicine search API
- Billing API
- Inventory endpoints
- Reports API
- Request/response formats
- Error codes

### 5. **DEVELOPMENT.md** - Developer Guide
Code standards, patterns, and best practices.
- TypeScript conventions
- File organization
- API development patterns
- React component guidelines
- Database queries
- Testing templates
- Performance optimization
- Common pitfalls to avoid

### 6. **DEPLOYMENT.md** - Production Guide
How to deploy to production and operate the system.
- Pre-deployment checklist
- Database setup
- Deployment options (Vercel, Docker, VPS)
- Environment configuration
- Monitoring & logging
- Scaling strategies
- Backup & recovery

---

## Feature Guides

### Authentication
- **Where**: `app/api/auth/login`, `app/api/auth/pos-login`
- **How**: Email/password or 4-digit POS PIN
- **Token**: JWT stored in localStorage
- **Session**: 15-minute inactivity timeout

### Retail Billing (POS)
- **Where**: `app/dashboard/billing`
- **Features**:
  - Fast medicine search (<1 second)
  - Real-time stock availability
  - Barcode scanning support
  - Automatic GST calculation
  - Multiple payment modes
- **Flow**: Search → Select Batch → Add to Cart → Checkout

### Wholesale Billing
- **Where**: Same as retail (switch toggle)
- **Features**:
  - Credit tracking
  - Batch selection
  - Scheme support
  - Party ledger
- **Payment**: Cash, Card, UPI, Cheque, Credit

### Inventory Management
- **Where**: `app/dashboard/inventory`
- **Features**:
  - Batch-wise stock tracking
  - FEFO automatic allocation
  - Low stock alerts
  - Near-expiry warnings
  - Rack location tracking

### Reports
- **Where**: `app/dashboard/reports`
- **Reports Available**:
  - Daily sales summary
  - Top selling medicines
  - Low stock medicines
  - Near-expiry items
  - Outstanding balances

---

## File Structure

```
ayurstock-pro/
├── README.md              ← Project overview
├── SETUP.md               ← Quick start guide
├── ARCHITECTURE.md        ← System design
├── DEVELOPMENT.md         ← Code guidelines
├── DEPLOYMENT.md          ← Production guide
│
├── app/
│   ├── api/               ← REST API routes
│   ├── dashboard/         ← Protected pages
│   ├── login/             ← Auth page
│   ├── layout.tsx         ← Root layout
│   └── globals.css        ← Global styles
│
├── components/            ← Reusable React components
├── lib/                   ← Utilities & helpers
├── middleware/            ← Auth guards
├── services/              ← Business logic
├── types/                 ← TypeScript definitions
├── hooks/                 ← Custom React hooks
├── prisma/
│   └── schema.prisma      ← Database schema
│
├── scripts/
│   └── seed.js            ← Demo data seeding
│
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.ts
```

---

## Common Tasks

### Task: Add a New Medicine
1. Go to `/dashboard/medicines`
2. Click "Add Medicine"
3. Fill form: Name, Company, Category, HSN, Rack Location
4. Submit
5. Create batches from inventory page

### Task: Create a Sale
1. Go to `/dashboard/billing`
2. Search for medicine by name/company/barcode
3. Select batch (FEFO ordered)
4. Enter quantity
5. Click "Add to Cart"
6. Review totals & GST
7. Click "Complete Sale"
8. Invoice generated

### Task: Check Low Stock Items
1. Go to `/dashboard/inventory`
2. Click "⚠️ Low Stock" button
3. View all medicines with stock below threshold

### Task: View Sales Report
1. Go to `/dashboard/reports`
2. Select date range (default: last 30 days)
3. Choose report type:
   - Daily Sales Summary
   - Top Selling Medicines
4. Export if needed

### Task: Add New User
1. Admin login to `/dashboard`
2. Go to `/dashboard/settings` (when available)
3. Click "Add User"
4. Enter: Name, Email, Role (ADMIN/MANAGER/CASHIER)
5. System sends password setup email
6. User completes setup and logs in

---

## Keys to Remember

### Multi-Tenancy
⚠️ **CRITICAL**: Every query must include `shopId` from user context.
```typescript
// Always do this:
const sales = await prisma.sale.findMany({
  where: { shopId: user.shopId }  // Never forget!
});
```

### FEFO (First Expiry First Out)
✅ System automatically selects earliest-expiring batch when selling.
```typescript
// Batches ordered by expiry date
ORDER BY expiryDate ASC
```

### Role-Based Access
- **Admin**: Full access (users, settings, everything)
- **Manager**: Inventory, purchases, reports (no admin functions)
- **Cashier**: Billing only (no data modification)

### Invoice Format
- Includes shop GSTIN
- Lists each item with HSN, batch, expiry
- Shows GST calculation per item
- Contains "AYURSTOCK DISTRIBUTION" watermark

---

## Next Phase Features (Post-MVP)

- [ ] POS Receipt Printing
- [ ] Mobile App (React Native)
- [ ] Offline Mode
- [ ] Advanced Reporting (Custom Reports)
- [ ] Customer Loyalty Program
- [ ] Multi-Location Warehouse
- [ ] Email/SMS Notifications
- [ ] GST Return Filing Integration
- [ ] Supplier Return Management
- [ ] Account Reconciliation

---

## Support & Resources

### Local Development Issues
- Check error logs: `npm run dev` console output
- Debug database: `npm run prisma:studio`
- Check API: Use Postman or curl
- Browser console: Developer Tools → Console tab

### Production Issues
- Check error tracking: Sentry/DataDog dashboard
- Check logs: `pm2 logs ayurstock`
- Check database: `psql` command line
- Health check: `curl https://yourdomain.com/api/health`

### Code References
- Prisma Docs: https://www.prisma.io/docs/
- Next.js Docs: https://nextjs.org/docs
- React Docs: https://react.dev
- TypeScript Docs: https://www.typescriptlang.org/docs/

---

## Quick Reference: Login Credentials

After running `npm run prisma:studio` and seeding:

| User | Email | Password | PIN |
|------|-------|----------|-----|
| Admin | admin@demo.com | Demo@123 | 1234 |
| Manager | manager@demo.com | Manager@123 | 2345 |
| Cashier | cashier@demo.com | Cashier@123 | 3456 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | Jan 2025 | MVP release: Auth, Billing, Inventory, Reports |

---

**Happy coding! 🚀** Start with SETUP.md and reference other docs as needed.
