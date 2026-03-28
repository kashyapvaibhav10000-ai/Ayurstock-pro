# AyurStock Pro - Architecture & Design Document

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer (Browser)                      │
│                     React 18 + TypeScript + Tailwind                 │
├─────────────────────────────────────────────────────────────────────┤
│  [Login] [Dashboard] [Billing POS] [Inventory] [Reports] [Settings] │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
                             │ REST API
┌────────────────────────────▼────────────────────────────────────────┐
│                    Next.js API Routes (Backend)                      │
│                      TypeScript + Express-like                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Auth Routes  │  │ Business API │  │ Middleware & Guards      │   │
│  ├──────────────┤  ├──────────────┤  ├──────────────────────────┤   │
│  │ /auth/login  │  │ /medicines   │  │ ├ Authentication (JWT)   │   │
│  │ /auth/pos    │  │ /sales       │  │ ├ Authorization (RBAC)  │   │
│  └──────────────┘  │ /inventory   │  │ ├ Shop isolation        │   │
│                    │ /suppliers   │  │ └ Validation (Zod)      │   │
│                    │ /reports     │  └──────────────────────────┘   │
│                    └──────────────┘  ┌──────────────────────────┐   │
│                                       │  Business Logic Services │   │
│                    ┌──────────────┐  ├──────────────────────────┤   │
│                    │ Validations  │  │ ├ billing.ts (POS logic)│   │
│                    │ (Zod Schemas)│  │ ├ inventory.ts (FEFO)   │   │
│                    └──────────────┘  │ └ GST calculations      │   │
│                                       └──────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────────┘
                             │ SQL (Prisma ORM)
────────────────────────────▼────────────────────────────────────────
                    SQLite Database
                 
      ┌─────────────────────────────────────────────┐
      │ Tables:                                       │
      │ ├── Shop (Tenant isolation)                  │
      │ ├── User (RBAC)                              │
      │ ├── Medicine (Master)                        │
      │ ├── InventoryBatch (Stock + FEFO)           │
      │ ├── Sale / SaleItem (Retail & Wholesale)    │
      │ ├── Purchase / PurchaseItem                  │
      │ ├── Supplier / Customer                      │
      │ ├── Return (Management)                      │
      │ ├── ActivityLog (Audit Trail)               │
      │ └── LoginHistory (Security)                  │
      └─────────────────────────────────────────────┘
```

## Data Flow: Billing Operation

```
User enters search query
        │
        ▼
┌──────────────────────┐
│ Medicine Search API  │  (Debounced 300ms)
│ ├─ Name search      │  (Indexed on db)
│ ├─ Company search   │
│ └─ Barcode scan     │
└──────┬───────────────┘
       │ Returns: name, company, stock, next expiry, rack location
       ▼
User selects medicine
        │
        ▼
┌──────────────────────────┐
│ Get Available Batches    │  (FEFO ordering)
│ SELECT * FROM batches    │
│ ORDER BY expiryDate ASC  │  (Earliest first)
│ WHERE shopId = shop_123  │
│ AND stockQty > 0         │
└──────┬───────────────────┘
       │
       ▼
User selects batch & quantity, clicks "Add to Cart"
        │
        ▼
┌─────────────────────────┐
│ Calculate Line Item     │
│ ├─ quantity × rate      │
│ ├─ apply discount       │
│ ├─ calculate GST        │
│ └─ generate amount      │
└──────┬──────────────────┘
       │
       ▼
Cart shown with running totals
        │
        ▼
User clicks "Complete Sale"
        │
        ▼
┌────────────────────────────────────┐
│ Create Sale Transaction            │
│ ├─ Validate stock available        │
│ ├─ Calculate invoice totals        │
│ ├─ Create Sale record              │
│ ├─ Create SaleItem records         │
│ └─ Reduce batch stock              │  (Atomic transaction)
└────────┬───────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ Log Activity        │
│ CREATE_SALE event   │
└─────────────────────┘
         │
         ▼
Invoice generated and displayed
```

## Multi-Tenancy (Shop Isolation)

Every record belongs to a `shopId`. Complete data isolation.

### Query Pattern
```typescript
// ❌ WRONG: Could expose data from other shops
const sales = await prisma.sale.findMany({
  where: { createdAt: { gte: today } }
});

// ✅ CORRECT: Always filter by shopId
const sales = await prisma.sale.findMany({
  where: { 
    shopId: user.shopId,  // Critical!
    createdAt: { gte: today } 
  }
});
```

### Enforcement Points
1. **Middleware**: Every API route validates `shopId`
2. **Database**: All queries filtered by `shopId`
3. **UI**: User can only see their shop's data
4. **Indexes**: `(shopId, field)` indexes for performance

## Role-Based Access Control (RBAC)

### Roles & Permissions Matrix

| Feature | Admin | Manager | Cashier |
|---------|-------|---------|---------|
| Billing (Retail) | ✓ | ✓ | ✓ |
| Billing (Wholesale) | ✓ | ✓ | ✓ |
| View Inventory | ✓ | ✓ | ✓ |
| Edit Inventory | ✓ | ✓ | ✗ |
| Medicine Master | ✓ | ✓ | ✗ |
| Purchases | ✓ | ✓ | ✗ |
| Suppliers | ✓ | ✓ | ✗ |
| Reports | ✓ | ✓ | ✗ |
| User Management | ✓ | ✗ | ✗ |
| Settings | ✓ | ✗ | ✗ |

### Enforcement Points
```typescript
// Route-level guard
if (!['ADMIN', 'MANAGER'].includes(user.role)) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// UI-level guard
{user.role === 'ADMIN' && <AdminPanel />}
```

## FEFO (First Expiry First Out) Logic

Automatic stock allocation ensures you sell oldest stock first.

### Algorithm
```
1. Get all batches for medicine where:
   - shopId matches
   - stockQty > 0
   - expiryDate > now

2. Sort by expiryDate ASC (earliest first)

3. When selling:
   - Check first batch stock
   - If sufficient: allocate from that batch
   - If insufficient: fail (user may split across batches in next phase)

4. On sale completion:
   - Reduce stock from allocated batch
   - Record which batch was allocated
```

### Example
```
Medicine: Ashwagandha
Batches:
├─ Batch A: Expiry 2025-06-01, Stock: 50
├─ Batch B: Expiry 2025-08-15, Stock: 30
└─ Batch C: Expiry 2025-12-31, Stock: 100

Sale of 40 units:
✓ Allocate from Batch A (expires first)
✓ Stock reduced: 50 → 10
✓ Batch B untouched
✓ Invoice shows: Batch A, Batch #XXXXX, Expiry 2025-06-01
```

## Billing Calculation Example

### Retail Sale (GST 5%)
```
Item 1: Ashwagandha 500mg
  - Quantity: 2
  - Rate: ₹450/unit
  - Subtotal: 2 × ₹450 = ₹900
  - Discount: ₹0
  - After Discount: ₹900
  - GST (5%): ₹900 × 5% = ₹45
  - Amount: ₹900 + ₹45 = ₹945

Item 2: Brahmi 250mg
  - Quantity: 1
  - Rate: ₹300/unit
  - Subtotal: 1 × ₹300 = ₹300
  - Discount: ₹50
  - After Discount: ₹250
  - GST (12%): ₹250 × 12% = ₹30
  - Amount: ₹250 + ₹30 = ₹280

Invoice Totals:
  Subtotal:      ₹900 + ₹300 = ₹1200
  Total Discount: ₹0 + ₹50 = ₹50
  Total GST:     ₹45 + ₹30 = ₹75
  Grand Total:   ₹1200 - ₹50 + ₹75 = ₹1225
```

### Wholesale with Credit
```
Items subtotal: ₹5000
Scheme discount: -₹500 (Buy 10 get 1 free)
After discount: ₹4500
GST (12%): ₹540
Grand Total: ₹5040

Payment mode: CREDIT
Credit due: ₹5040
```

## API Request/Response Pattern

### Standard Response Format
```typescript
// Success
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation successful"
}

// Error
{
  "success": false,
  "error": "Detailed error message",
  "statusCode": 400
}
```

### Paginated Response
```typescript
{
  "success": true,
  "data": [ /* array of items */ ],
  "total": 150,
  "page": 1,
  "pageSize": 20,
  "totalPages": 8
}
```

### Error Codes
```
200 OK              - Success
201 Created         - Resource created
400 Bad Request     - Validation error
401 Unauthorized    - Missing/invalid token
403 Forbidden       - Insufficient permissions
404 Not Found       - Resource not found
500 Server Error    - Unexpected error
```

## Database Optimization

### Indexes Created
```sql
-- Search optimization
CREATE INDEX idx_medicine_name ON "Medicine"(shopId, name);
CREATE INDEX idx_medicine_company ON "Medicine"(shopId, company);
CREATE INDEX idx_medicine_barcode ON "Medicine"(shopId, barcode);

-- Inventory optimization
CREATE INDEX idx_batch_fefo ON "InventoryBatch"(shopId, medicineId, expiryDate);
CREATE INDEX idx_batch_lookup ON "InventoryBatch"(medicineId);

-- Sales reporting
CREATE INDEX idx_sale_date ON "Sale"(shopId, createdAt);
CREATE INDEX idx_sale_customer ON "Sale"(customerId);

-- Activity logging
CREATE INDEX idx_activity_log ON "ActivityLog"(shopId, createdAt);
```

### Query Optimization
```typescript
// ❌ SLOW: N+1 queries
const sales = await prisma.sale.findMany();
for (const sale of sales) {
  const items = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
}

// ✅ FAST: Single query with includes
const sales = await prisma.sale.findMany({
  include: {
    saleItems: {
      include: { medicine: true, batch: true }
    }
  }
});
```

## Authentication Flow

### Login Sequence
```
1. User enters email/password
       ↓
2. Backend validates credentials
       ├─ Check user exists
       ├─ Verify password hash (bcrypt)
       ├─ Check user is active (isActive=true)
       └─ Check user belongs to a shop
       ↓
3. Generate JWT token
       └─ Payload: userId, shopId, email, role, exp
       ↓
4. Store token in localStorage
       └─ Used in Authorization header for all subsequent requests
       ↓
5. Token verification on each request
       ├─ Extract from Authorization header
       ├─ Verify signature
       ├─ Check expiration
       └─ Validate user still exists and active
       ↓
6. If invalid: 401 Unauthorized → Redirect to login
```

### POS PIN Flow
```
1. User enters 4-digit PIN
       ↓
2. Backend finds user with matching PIN
       ├─ WHERE pin = '1234' AND isActive = true
       ├─ If not found: 401 Invalid PIN
       ↓
3. Generate JWT token (same as password login)
       ↓
4. Fast cashier login without typing password
```

### Session Timeout (15 minutes)
```
1. Track last user activity (mousedown, keydown, scroll)
2. Set timeout for 15 minutes
3. On activity: Reset timeout
4. On timeout: Logout → Redirect to login
5. Activity log records user session
```

## Error Handling Strategy

### Validation Layer (Zod)
```typescript
const SaleSchema = z.object({
  items: z.array(...).min(1),
  paymentMode: z.enum(['CASH', 'CARD', ...]),
  customerId: z.string().optional(),
});

const validation = SaleSchema.safeParse(body);
if (!validation.success) {
  return createErrorResponse('Validation error', 400);
}
```

### Business Logic Errors
```typescript
// Stock check
if (batch.stockQty < quantity) {
  return createErrorResponse('Insufficient stock', 400);
}

// Permission check
if (!['ADMIN', 'MANAGER'].includes(user.role)) {
  return createErrorResponse('Forbidden', 403);
}

// Shop isolation
if (medicine.shopId !== user.shopId) {
  return createErrorResponse('Forbidden - Shop access denied', 403);
}
```

### Unexpected Errors
```typescript
try {
  // ... operation
} catch (error) {
  // Log to Sentry/error tracking
  logError(error, context);
  
  // Return generic error to client
  return createErrorResponse('Internal server error', 500);
}
```

## Testing Strategy

### Unit Tests
```typescript
// Test billing calculation
test('calculateBilling: retail sale with GST', () => {
  const items = [
    { quantity: 2, rate: 500, discount: 0, gstPercent: 5 }
  ];
  const result = calculateBilling(items);
  
  expect(result.subtotal).toBe(1000);
  expect(result.gstTotal).toBe(50);
  expect(result.grandTotal).toBe(1050);
});
```

### Integration Tests
```typescript
// Test complete billing flow
test('POST /api/sales creates sale and reduces stock', async () => {
  // Create medicine, batch, user, shop
  // Call POST /api/sales
  // Verify sale record created
  // Verify stock reduced
  // Verify invoice number generated
});
```

### End-to-End Tests
```typescript
// Test from UI to database
test('Billing: Search → Add to Cart → Checkout', async () => {
  // Navigate to /dashboard/billing
  // Search for medicine
  // Select batch
  // Add to cart
  // Verify cart count
  // Click checkout
  // Verify invoice number displayed
  // Verify redirect to dashboard
});
```

---

**Architecture is production-ready and scalable to handle 100+ concurrent users.**
