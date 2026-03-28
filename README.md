# AyurStock Pro - Ayurvedic Pharmacy Management SaaS

A production-grade, multi-tenant SaaS application for Ayurvedic pharmacy operations including retail billing, wholesale distribution, inventory management with batch tracking, and GST-compliant invoicing.

## Features

### Core Modules
- **Retail POS Billing** - Fast, keyboard-first billing system for retail stores
- **Wholesale Billing** - Credit billing, batch management, scheme support
- **Inventory Management** - Batch-wise tracking with FEFO (First Expiry First Out) allocation
- **Medicine Master** - Complete medicine database with HSN, batch tracking
- **Supplier Management** - Manage suppliers and purchase orders
- **Reports Dashboard** - Daily sales, top medicines, low stock, near expiry alerts
- **Activity Logging** - Complete audit trail for compliance

### Authentication & Security
- JWT-based authentication with secure token management
- 4-digit POS PIN for quick cashier login
- Role-based access control (Admin, Manager, Cashier)
- Session timeout after 15 minutes inactivity
- Login history tracking
- Admin-only user creation (no public signup)

### Inventory Features
- Batch-wise stock management with expiry tracking
- FEFO (First Expiry First Out) automatic allocation
- Low stock alerts
- Near-expiry warnings
- Rack location tracking
- Customer and supplier returns management

### Billing Features
- Fast medicine search (<1 second)
- Real-time stock availability
- GST-compliant invoicing
- Multiple payment modes (Cash, Card, UPI, Cheque, Credit)
- Barcode scanning support
- Optimistic UI updates

## Tech Stack

### Frontend
- **Next.js 14** - App Router with TypeScript
- **React 18** - Component library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **TanStack Query** - Data fetching & caching
- **Axios** - HTTP client
- **React Hook Form** - Form management

### Backend
- **Next.js API Routes** - Serverless functions
- **TypeScript** - Type-safe backend code
- **Zod** - Request/response validation

### Database
- **SQLite** - Current development database
- **Prisma ORM** - Database abstraction & migrations

### Authentication
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT token generation & verification

## Architecture

### Multi-Tenant Design
```
Shop (Tenant)
├── Users (Admin, Manager, Cashier)
├── Medicines
│   └── InventoryBatches (Stock, Expiry, MRP)
├── Sales (Retail & Wholesale)
│   └── SaleItems
├── Purchases
│   └── PurchaseItems
├── Suppliers
├── Customers
├── Returns (Customer & Supplier)
└── ActivityLogs
```

**Key Principle**: Every record is scoped by `shopId`. Complete data isolation between shops.

### Directory Structure
```
ayurstock-pro/
├── app/
│   ├── api/                    # API routes
│   │   ├── auth/              # Login, POS PIN login
│   │   ├── medicines/         # Search, create
│   │   ├── inventory/         # Batches, low stock, expiry
│   │   ├── sales/             # Billing, invoices
│   │   ├── suppliers/         # Supplier management
│   │   └── reports/           # Sales, medicines reports
│   ├── dashboard/             # Protected pages
│   │   ├── billing/           # POS interface
│   │   ├── inventory/         # Stock management
│   │   ├── medicines/         # Medicine master
│   │   ├── purchases/         # Purchase orders
│   │   ├── reports/           # Analytics
│   │   └── settings/          # Admin settings
│   ├── login/                 # Authentication page
│   ├── layout.tsx             # Root layout
│   └── globals.css            # Global styles
├── components/                # Reusable UI components
│   └── Sidebar.tsx           # Navigation sidebar
├── lib/                       # Utilities & helpers
│   ├── db.ts                 # Prisma client
│   ├── auth.ts               # Auth utilities
│   └── schemas.ts            # Zod validation schemas
├── middleware/                # Route guards & auth
│   └── auth.ts               # Auth middleware
├── services/                  # Business logic
│   ├── billing.ts            # Billing calculations
│   ├── inventory.ts          # FEFO stock allocation
│   └── reports.ts            # Report generation
├── types/                     # TypeScript definitions
│   └── index.ts              # Type exports
├── prisma/
│   └── schema.prisma         # Database schema
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- npm or yarn

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

### 3. Create Database
```bash
# SQLite database file will be created automatically by Prisma
```

### 4. Run Migrations
```bash
npm run prisma:migrate
```

This will:
- Create all tables (Shop, User, Medicine, InventoryBatch, Sale, etc.)
- Create indexes for performance
- Set up relationships & constraints

### 5. Seed Demo Data (Optional)
```bash
npm run prisma:studio
```

Use Prisma Studio to manually create:
1. A Shop record
2. An admin User for that shop
3. Sample medicines and batches

### 6. Start Development Server
```bash
npm run dev
```

Visit: `http://localhost:3000/login`

## API Documentation

### Authentication

#### Email & Password Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@pharmacy.com",
  "password": "securepassword"
}

Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user_123",
      "name": "John Doe",
      "email": "user@pharmacy.com",
      "role": "ADMIN",
      "shop": {
        "id": "shop_123",
        "name": "My Pharmacy"
      }
    }
  }
}
```

#### POS PIN Login (4-digit)
```bash
POST /api/auth/pos-login
Content-Type: application/json

{
  "pin": "1234"
}
```

### Medicines Search

**Fast Search** - Returns in <1 second with autocomplete
```bash
GET /api/medicines/search?query=aspirin&limit=10
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "med_123",
      "name": "Aspirin 500mg",
      "company": "Baidyanath",
      "availableStock": 45,
      "rackLocation": "A-5-2",
      "nextExpiryDate": "2025-12-31"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

### Create Sale/Invoice

**Retail Billing**
```bash
POST /api/sales
Authorization: Bearer <token>
Content-Type: application/json

{
  "saleType": "RETAIL",
  "customerId": null,
  "items": [
    {
      "medicineId": "med_123",
      "batchId": "batch_123",
      "quantity": 2,
      "rate": 500,
      "discount": 0,
      "gstPercent": 5
    }
  ],
  "paymentMode": "CASH",
  "discountTotal": 0
}

Response:
{
  "success": true,
  "data": {
    "id": "sale_123",
    "invoiceNumber": "INV-1234567890",
    "grandTotal": 1050,
    "createdAt": "2025-01-20T10:30:00Z"
  }
}
```

### Inventory Endpoints

**Get Available Batches (FEFO sorted)**
```bash
GET /api/inventory/batches?medicineId=med_123
Authorization: Bearer <token>

Returns earliest-expiring batches first
```

**Get Low Stock Report**
```bash
GET /api/inventory/batches?report=low-stock
Authorization: Bearer <token>
```

**Get Near Expiry Report** (within 30 days)
```bash
GET /api/inventory/batches?report=near-expiry
Authorization: Bearer <token>
```

### Reports

**Daily Sales Summary**
```bash
GET /api/reports?type=daily-sales&startDate=2025-01-01&endDate=2025-01-31
Authorization: Bearer <token>
```

**Top Selling Medicines**
```bash
GET /api/reports?type=top-medicines&startDate=2025-01-01&endDate=2025-01-31
Authorization: Bearer <token>
```

## Database Schema

### Key Tables

#### Shop (Tenant)
```sql
CREATE TABLE "Shop" (
  id String PRIMARY KEY
  name String
  gstin String UNIQUE
  address String
  phone String
  email String
  createdAt DateTime
  updatedAt DateTime
)
```

#### User (Multi-role)
```sql
CREATE TABLE "User" (
  id String PRIMARY KEY
  shopId String REFERENCES Shop
  name String
  email String
  passwordHash String
  role Enum(ADMIN, MANAGER, CASHIER)
  pin String (4-digit)
  isActive Boolean
  createdAt DateTime
  updatedAt DateTime
)
UNIQUE(shopId, email)
```

#### Medicine (Master)
```sql
CREATE TABLE "Medicine" (
  id String PRIMARY KEY
  shopId String
  name String
  company String
  category String
  barcode String
  hsn String
  rackLocation String
  unit String
  isActive Boolean
  UNIQUE(shopId, barcode)
  INDEX(shopId, name)
  INDEX(shopId, company)
)
```

#### InventoryBatch (Stock with FEFO)
```sql
CREATE TABLE "InventoryBatch" (
  id String PRIMARY KEY
  shopId String
  medicineId String
  batchNumber String
  expiryDate DateTime
  stockQty Int
  mrp Decimal
  purchaseRate Decimal
  sellingRate Decimal
  UNIQUE(shopId, medicineId, batchNumber)
  INDEX(shopId, medicineId, expiryDate) -- For FEFO
}
```

#### Sale (Invoice)
```sql
CREATE TABLE "Sale" (
  id String PRIMARY KEY
  shopId String
  customerId String (nullable)
  saleType Enum(RETAIL, WHOLESALE)
  invoiceNumber String
  subtotal Decimal
  discountTotal Decimal
  gstTotal Decimal
  grandTotal Decimal
  paymentMode Enum(CASH, CARD, UPI, CHEQUE, CREDIT)
  creditDue Decimal (for wholesale)
  createdByUserId String
  createdAt DateTime
  UNIQUE(shopId, invoiceNumber)
  INDEX(shopId, createdAt)
}
```

## Performance Optimizations

### Database
- Indexed searches on `medicine.name`, `medicine.company`, `medicine.barcode`
- FEFO indexes on `inventoryBatch(medicineId, expiryDate)`
- Sale indexes on `sale(shopId, createdAt)` for reports

### Frontend
- TanStack Query for data caching & revalidation
- Optimistic UI updates for billing actions
- Debounced medicine search (300ms)
- Code splitting with Next.js dynamic imports

### API
- Lean JSON payloads (only required fields)
- Paginated responses for large datasets
- Efficient database queries with Prisma select()

## Role-Based Access Control

### Admin
- ✓ User management (create, edit, deactivate)
- ✓ Shop settings and configuration
- ✓ Medicine master management
- ✓ All reports and analytics
- ✓ System administration

### Manager
- ✓ Retail & wholesale billing
- ✓ Inventory management
- ✓ Purchase orders
- ✓ Supplier management
- ✓ Reports
- ✗ User management
- ✗ Shop settings

### Cashier
- ✓ Retail & wholesale billing
- ✓ View inventory (read-only)
- ✗ Manage inventory
- ✗ Reports
- ✗ User management

## Common Workflows

### Creating a Sale (Retail Billing)
1. User logs in at POS
2. Search for medicine (name, company, barcode)
3. Select amount; system auto-picks FEFO batch
4. Add to cart
5. Review prices, GST, discount
6. Select payment mode
7. Create sale → Invoice generated
8. Stock automatically reduced

### Low Stock & Expiry Management
1. Dashboard shows alerts for low stock & near-expiry items
2. Reports page shows detailed lists
3. Pharmacy can create purchases or manage manually
4. Activity log tracks all changes

### Wholesale Credit Billing
1. Create sale with WHOLESALE type
2. Select customer (or create new)
3. Set payment mode to CREDIT
4. Enter credit due amount
5. Generate invoice stamped "AYURSTOCK DISTRIBUTION"
6. Track outstanding balances in reports

## Migration from Tally/Marg ERP

**Data Import Strategy:**
- Export medicines from existing system (CSV)
- Create batch records manually or via bulk import
- Migrate last 3 months of sales for historical reporting
- Test thoroughly before going live

## Compliance & GST

- **GST Calculation**: Automatic on each line item and invoice
- **Invoice Format**: Shop GSTIN, medicines with HSN, batch, expiry
- **Watermark**: "AYURSTOCK DISTRIBUTION" on all invoices
- **Records**: Complete activity log for audit trail

## Troubleshooting

### Database Connection Failed
```bash
# Verify DATABASE_URL in .env.local points to file:./prisma/dev.db
# Ensure prisma/dev.db exists after running migrations
```

### Port 3000 Already in Use
```bash
npm run dev -- -p 3001
```

### Prisma Generate Errors
```bash
npm run prisma:generate
```

## Next Phase Features (Post-MVP)

- [ ] POS screen printing with thermal printer support
- [ ] Customer loyalty program & discounts
- [ ] Multi-location warehouse management
- [ ] Advanced reporting with custom date ranges
- [ ] Mobile app for offline sales
- [ ] SMS/Email notifications for low stock
- [ ] Supplier return & credit note management
- [ ] Account reconciliation & payment tracking
- [ ] Employee performance tracking
- [ ] Integration with GST/Income Tax filing

## Support & Development

For issues or feature requests, please document:
1. Steps to reproduce
2. Expected vs actual behavior
3. Database state (if applicable)
4. Browser/system information

## License

Proprietary - AyurStock Pro SaaS Application

---

**Version**: 0.1.0 (MVP)  
**Last Updated**: January 2025
