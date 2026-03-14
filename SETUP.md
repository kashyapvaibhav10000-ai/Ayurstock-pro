# AyurStock Pro - Quick Start Guide

## 5-Minute Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Database
```bash
# Local development uses SQLite.
# The database file is created automatically by Prisma at:
# prisma/dev.db
```

### Step 3: Setup Environment
```bash
cp .env.example .env.local
```

Then edit `.env.local`:
```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-secret-key-at-least-32-chars-change-in-production"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

### Step 4: Create Database Schema
```bash
npm run prisma:migrate
```

This creates:
- Shop table
- User table
- Medicine table (with pharmacy-specific fields)
- InventoryBatch table (for FEFO tracking)
- Sale, SaleItem tables (for invoicing)
- Purchase, PurchaseItem tables
- Supplier, Customer tables
- Return, ActivityLog tables

### Step 5: Create Demo Shop & User
Open Prisma Studio:
```bash
npm run prisma:studio
```

Navigate to `http://localhost:5555`

#### Create Shop Record:
In "Shop" table, add:
- `id`: `shop_demo` (auto-generated)
- `name`: `Demo Pharmacy`
- `gstin`: `27AABDH1234H1Z5`
- `address`: `123 Market Street, Mumbai`
- `phone`: `+919876543210`
- `email`: `pharmacy@demo.com`

#### Create Admin User:
In "User" table, add:
- `shopId`: `[shop_demo_id_from_above]`
- `name`: `Admin User`
- `email`: `admin@demo.com`
- `passwordHash`: Generate in Node:
  ```bash
  node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('Demo@123', 10))"
  ```
  Copy output and paste
- `role`: `ADMIN`
- `isActive`: `true`
- `pin`: `1234` (for POS login)

#### Create Sample Medicine:
In "Medicine" table, add:
- `shopId`: [same as above]
- `name`: `Ashwagandha Extract`
- `company`: `Patanjali`
- `category`: `Herbal Supplement`
- `barcode`: `8901234567890`
- `hsn`: `3004`
- `rackLocation`: `A-1-1`
- `unit`: `strip`
- `isActive`: `true`

#### Create InventoryBatch:
In "InventoryBatch" table, add:
- `shopId`: [same as above]
- `medicineId`: [from above]
- `batchNumber`: `BATCH001`
- `expiryDate`: `2026-12-31`
- `stockQty`: `100`
- `mrp`: `500`
- `purchaseRate`: `350`
- `sellingRate`: `450`

Close Prisma Studio (Ctrl+C in terminal).

### Step 6: Start Development Server
```bash
npm run dev
```

Server starts on `http://localhost:3000`

### Step 7: Login
Visit: `http://localhost:3000/login`

**Email Login:**
- Email: `admin@demo.com`
- Password: `Demo@123`

**OR POS PIN Login (faster):**
- Open `/login` and change URL to `/dashboard`
- Use: PIN `1234`

## Quick Test Workflows

### Test 1: Create a Sale (Retail Billing)
1. Login as admin
2. Click "Billing" in sidebar
3. Ensure "Retail" is selected
4. Search for medicine: "Ashwagandha"
5. Select batch, enter quantity
6. Click "Add to Cart"
7. Click "Complete Sale"
8. Check invoice appears

### Test 2: Check Inventory
1. Click "Inventory" in sidebar
2. You should see the batch with stock quantity
3. Stock should have decreased by sale quantity

### Test 3: View Reports
1. Click "Reports"
2. Select "Daily Sales"
3. You should see today's transaction

## Deployment Checklist

Before going live:

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Update database credentials
- [ ] Set `NEXT_PUBLIC_API_URL` to production domain
- [ ] Run: `npm run build` to check for errors
- [ ] Test all billing workflows
- [ ] Test RBAC (role-based access)
- [ ] Verify GST calculations
- [ ] Test barcode scanning
- [ ] Load test with sample data (1000+ medicines, 1000+ sales)

## Troubleshooting

### "Database connection refused"
```bash
# Verify the SQLite database file exists
dir prisma\dev.db

# Recreate the Prisma client and database schema if needed
npm run prisma:generate
npm run prisma:migrate
```

### "Prisma schema not found"
```bash
npm run prisma:generate
```

### "Port 3000 in use"
```bash
npm run dev -- -p 3001
```

### Seed data missing
```bash
# Open Prisma Studio and recreate manually
npm run prisma:studio
```

## Database Size Management

```bash
# Backup production database
pg_dump -U postgres ayurstock_pro > backup.sql

# Restore
psql -U postgres ayurstock_pro < backup.sql

# Clear old sales (careful!)
DELETE FROM "Sale" WHERE "createdAt" < NOW() - INTERVAL '1 year';
DELETE FROM "LoginHistory" WHERE "createdAt" < NOW() - INTERVAL '3 months';
```

## API Quick Reference

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Demo@123"}'
```

### Search Medicines
```bash
curl -X GET "http://localhost:3000/api/medicines/search?query=ashwagandha" \
  -H "Authorization: Bearer TOKEN"
```

### Create Sale
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "saleType": "RETAIL",
    "items": [{"medicineId":"...","batchId":"...","quantity":2,"rate":450,"discount":0,"gstPercent":5}],
    "paymentMode": "CASH"
  }'
```

## Next Steps

1. **Customize**: Edit `colors` in `tailwind.config.ts` for branding
2. **Add Medicines**: Use Medicines Master page or Prisma Studio
3. **Test Workflows**: Try retail, wholesale, returns
4. **Configure GST Rates**: Modify in API (`gstPercent` in billing)
5. **Setup Backups**: Copy `prisma/dev.db` or move to a managed database later
6. **Monitor Logs**: Check `ActivityLog` table for audit trail

## Support URLs

- Dashboard: `http://localhost:3000/dashboard`
- Billing POS: `http://localhost:3000/dashboard/billing`
- Inventory: `http://localhost:3000/dashboard/inventory`
- Medicines: `http://localhost:3000/dashboard/medicines`
- Reports: `http://localhost:3000/dashboard/reports`
- Prisma Studio: `http://localhost:5555`

---

**You're all set!** 🎉 Start with the billing workflow and explore other modules.
