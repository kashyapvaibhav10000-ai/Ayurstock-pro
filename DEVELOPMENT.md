# AyurStock Pro - Development Guidelines

## Code Style & Conventions

### TypeScript

**Strict typing - No `any`**
```typescript
// ❌ BAD
function handleResponse(data: any) {
  return data.result;
}

// ✅ GOOD
interface SaleResponse {
  success: boolean;
  data: {
    saleId: string;
    invoiceNumber: string;
    grandTotal: Decimal;
  };
}

function handleResponse(data: SaleResponse) {
  return data.data.saleId;
}
```

**Use interfaces for data structures**
```typescript
// ✅ DO
interface Medicine {
  id: string;
  name: string;
  company: string;
  hsn: string;
}

// ❌ DON'T
type MedicineData = {
  id: string;
  name: string;
  company: string;
  hsn: string;
};
```

### File Organization

```
app/
├── api/
│   └── [resource]/
│       ├── route.ts          // GET, POST handlers
│       └── [id]/
│           └── route.ts      // GET, PUT, DELETE for single resource
├── dashboard/
│   ├── layout.tsx            // Shared layout
│   ├── page.tsx              // Index page
│   └── [module]/
│       └── page.tsx          // Module page

components/
├── Common/
│   ├── Button.tsx
│   ├── Modal.tsx
│   └── Table.tsx
├── Sidebar.tsx
└── Forms/
    ├── BillingForm.tsx
    └── MedicineForm.tsx

lib/
├── db.ts
├── auth.ts
├── schemas.ts
└── utils/
    ├── calculations.ts
    └── formatters.ts

services/
├── billing.ts
├── inventory.ts
└── reports.ts

types/
└── index.ts
```

### Naming Conventions

```typescript
// Files: kebab-case
components/medicine-search.tsx
services/inventory-service.ts

// Classes/Interfaces: PascalCase
interface MedicineResponse {}
class BillingCalculator {}

// Functions/Variables: camelCase
function calculateGst() {}
const totalAmount = 0;

// Constants: UPPER_SNAKE_CASE
const MAX_SEARCH_RESULTS = 50;
const JWT_EXPIRATION_TIME = 15 * 60 * 1000;

// Booleans: is/has/can prefix
const isActive = true;
const hasStock = true;
const canEdit = false;
```

## API Development Guidelines

### Route Structure
```typescript
// /app/api/medicines/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createErrorResponse, createPaginatedResponse } from '@/middleware/auth';
import { MedicineSearchSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // 2. Extract & validate input
    const searchParams = request.nextUrl.searchParams;
    const validation = MedicineSearchSchema.safeParse({
      query: searchParams.get('query'),
      limit: parseInt(searchParams.get('limit') || '20'),
    });

    if (!validation.success) {
      return createErrorResponse('Invalid parameters', 400);
    }

    // 3. Business logic
    const medicines = await fetchMedicines(
      auth.user.shopId,
      validation.data
    );

    // 4. Response
    return createPaginatedResponse(medicines, total, page, limit);

  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  // Similar pattern: auth → validate → process → respond
}
```

### Validation Pattern
```typescript
import { z } from 'zod';

const CreateBillingSchema = z.object({
  items: z.array(
    z.object({
      medicineId: z.string().min(1),
      batchId: z.string().min(1),
      quantity: z.number().int().positive(),
      rate: z.number().positive(),
      gstPercent: z.number().min(0).max(100),
    })
  ).min(1),
  paymentMode: z.enum(['CASH', 'CARD', 'UPI', 'CHEQUE', 'CREDIT']),
});

// Always validate before processing
const validation = CreateBillingSchema.safeParse(body);
if (!validation.success) {
  return createErrorResponse('Validation error', 400);
}

const { items, paymentMode } = validation.data;
```

### Error Response Pattern
```typescript
// All errors follow this format
{
  "success": false,
  "error": "Specific error message",
  "statusCode": 400
}

// With optional details
{
  "success": false,
  "error": "Validation error",
  "details": {
    "items": "Must have at least one item",
    "paymentMode": "Invalid payment mode"
  },
  "statusCode": 400
}
```

## Database & ORM Guidelines

### Prisma Best Practices

**Always use transactions for multi-step operations**
```typescript
// ❌ BAD: Could fail midway
const sale = await prisma.sale.create({ data: saleData });
for (const item of items) {
  await prisma.saleItem.create({ data: item });
}

// ✅ GOOD: Atomic operation
const sale = await prisma.sale.create({
  data: {
    ...saleData,
    saleItems: {
      create: items,
    },
  },
});
```

**Use `select` to return only needed fields**
```typescript
// ❌ BAD: Returns entire user object
const user = await prisma.user.findUnique({
  where: { id: userId }
});

// ✅ GOOD: Returns only needed fields
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
  },
});
```

**Always filter by shopId**
```typescript
// ✅ Every query MUST include shopId
const medicines = await prisma.medicine.findMany({
  where: {
    shopId: auth.user.shopId,  // Critical!
    isActive: true,
  },
});
```

**Use includes for relationships**
```typescript
const sale = await prisma.sale.findUnique({
  where: { id: saleId },
  include: {
    saleItems: {
      include: {
        medicine: { select: { name: true, company: true } },
        batch: { select: { batchNumber: true, expiryDate: true } },
      },
    },
    customer: true,
    createdByUser: { select: { name: true, email: true } },
  },
});
```

## React Component Guidelines

### Functional Components with Hooks
```typescript
'use client'; // Mark as client component

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks';

interface Props {
  medicineId: string;
  onSelect: (batchId: string) => void;
}

export default function BatchSelector({ medicineId, onSelect }: Props) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const api = useApi();

  useEffect(() => {
    const loadBatches = async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/inventory/batches', {
          params: { medicineId },
        });
        setBatches(response.data.data);
      } finally {
        setLoading(false);
      }
    };

    loadBatches();
  }, [medicineId, api]);

  const handleSelect = useCallback((batchId: string) => {
    onSelect(batchId);
  }, [onSelect]);

  if (loading) return <div>Loading...</div>;

  return (
    <select onChange={(e) => handleSelect(e.target.value)}>
      {batches.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {batch.batchNumber}
        </option>
      ))}
    </select>
  );
}
```

### Form Handling with React Hook Form
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateBillingSchema } from '@/lib/schemas';

export default function BillingForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(CreateBillingSchema),
  });

  const onSubmit = async (data) => {
    try {
      const response = await api.post('/api/sales', data);
      // Handle success
    } catch (error) {
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('paymentMode')} />
      {errors.paymentMode && <span>{errors.paymentMode.message}</span>}
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Testing Guidelines

### Unit Test Template
```typescript
// __tests__/services/billing.test.ts
import { calculateBilling } from '@/services/billing';

describe('calculateBilling', () => {
  it('should calculate subtotal correctly', () => {
    const items = [
      { quantity: 2, rate: 500, discount: 0, gstPercent: 5 }
    ];
    const result = calculateBilling(items);
    expect(result.subtotal.toNumber()).toBe(1000);
  });

  it('should apply discount', () => {
    const items = [
      { quantity: 2, rate: 500, discount: 100, gstPercent: 5 }
    ];
    const result = calculateBilling(items);
    expect(result.totalDiscount.toNumber()).toBe(100);
  });

  it('should calculate GST correctly', () => {
    const items = [
      { quantity: 1, rate: 1000, discount: 0, gstPercent: 12 }
    ];
    const result = calculateBilling(items);
    expect(result.totalGst.toNumber()).toBe(120);
  });
});
```

### API Test Template
```typescript
// __tests__/api/sales.test.ts
import axios from 'axios';

describe('POST /api/sales', () => {
  let token: string;

  beforeEach(async () => {
    // Login
    const response = await axios.post('/api/auth/login', {
      email: 'test@test.com',
      password: 'Test@123'
    });
    token = response.data.data.token;
  });

  it('should create sale with valid data', async () => {
    const response = await axios.post('/api/sales', {
      saleType: 'RETAIL',
      items: [{
        medicineId: 'med_123',
        batchId: 'batch_123',
        quantity: 2,
        rate: 500,
        discount: 0,
        gstPercent: 5
      }],
      paymentMode: 'CASH'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(response.status).toBe(201);
    expect(response.data.success).toBe(true);
    expect(response.data.data.invoiceNumber).toBeDefined();
  });
});
```

## Performance Optimization

### Code Splitting
```typescript
// Load heavy components only when needed
import dynamic from 'next/dynamic';

const ReportsChart = dynamic(
  () => import('@/components/ReportsChart'),
  { loading: () => <div>Loading...</div> }
);

export default function ReportsPage() {
  return <ReportsChart />;
}
```

### Caching Strategy
```typescript
// Cache medicine search results
export async function getMedicines(shopId: string, query: string) {
  const cacheKey = `medicines:${shopId}:${query}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const result = await prisma.medicine.findMany({
    where: { shopId, name: { contains: query } },
  });

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(result));

  return result;
}
```

## Common Pit Falls to Avoid

❌ **Don't expose shopId in URLs** (use auth context)
```
Bad: /api/medicines?shopId=shop_123
Good: API knows shopId from JWT token
```

❌ **Don't store sensitive data in localStorage**
```
Bad: localStorage.setItem('password', password)
Good: Only store token in localStorage
```

❌ **Don't make direct database queries from components**
```
Bad: const sales = prisma.sale.findMany()
Good: Fetch from API endpoint within useEffect
```

❌ **Don't skip Zod validation**
```
Bad: const items = body.items;
Good: const validation = SaleSchema.safeParse(body);
```

❌ **Don't forget FEFO ordering**
```
Bad: SELECT * FROM batches WHERE medicineId = xxx
Good: ORDER BY expiryDate ASC
```

## Documentation Requirements

Every API endpoint needs:
```markdown
## POST /api/sales

Create a sale/invoice (retail or wholesale)

### Authentication
Required: JWT token

### Authorization
Required roles: ADMIN, MANAGER, CASHIER

### Request Body
```json
{
  "saleType": "RETAIL",
  "items": [...],
  "paymentMode": "CASH"
}
```

### Response (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "sale_123",
    "invoiceNumber": "INV-123",
    "grandTotal": 1050
  }
}
```

### Error Cases
- 401: Unauthorized
- 403: Forbidden (insufficient permissions)
- 400: Validation error
- 500: Server error
```

## Debugging Tips

### Enable Prisma Logging
```typescript
// lib/db.ts
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});
```

### Check Network Requests
- DevTools → Network tab
- Filter by XHR
- Check Authorization header present

### Database Inspection
```bash
npm run prisma:studio
# Browse data at http://localhost:5555
```

### Token Debugging
```javascript
// Console
const token = localStorage.getItem('token');
const decoded = JSON.parse(atob(token.split('.')[1]));
console.log(decoded);
```

---

**Follow these guidelines for production-quality, maintainable code.**
