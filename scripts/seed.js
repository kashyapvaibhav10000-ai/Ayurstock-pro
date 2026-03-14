// Script to seed demo data into database
// Run: node scripts/seed.js (after setting up database)

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with demo data...');

  try {
    // 1. Create Shop
    const shop = await prisma.shop.create({
      data: {
        name: 'Demo Ayurveda Pharmacy',
        gstin: '27AABDH1234H1Z5',
        address: '123 Market Street, Mumbai, Maharashtra 400001',
        phone: '+919876543210',
        email: 'demo@pharmacy.com',
      },
    });
    console.log('✓ Created shop:', shop.name);

    // 2. Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        shopId: shop.id,
        name: 'Admin User',
        email: 'admin@demo.com',
        passwordHash: bcrypt.hashSync('Demo@123', 10),
        role: 'ADMIN',
        pin: '1234',
        isActive: true,
      },
    });
    console.log('✓ Created admin user:', adminUser.email);

    // 3. Create Manager User
    const managerUser = await prisma.user.create({
      data: {
        shopId: shop.id,
        name: 'Manager',
        email: 'manager@demo.com',
        passwordHash: bcrypt.hashSync('Manager@123', 10),
        role: 'MANAGER',
        pin: '2345',
        isActive: true,
      },
    });
    console.log('✓ Created manager user:', managerUser.email);

    // 4. Create Cashier User
    const cashierUser = await prisma.user.create({
      data: {
        shopId: shop.id,
        name: 'Cashier',
        email: 'cashier@demo.com',
        passwordHash: bcrypt.hashSync('Cashier@123', 10),
        role: 'CASHIER',
        pin: '3456',
        isActive: true,
      },
    });
    console.log('✓ Created cashier user:', cashierUser.email);

    // 5. Create Sample Medicines
    const medicines = await Promise.all([
      prisma.medicine.create({
        data: {
          shopId: shop.id,
          name: 'Ashwagandha Extract 500mg',
          company: 'Patanjali',
          category: 'Herbal Supplement',
          barcode: '8901234567890',
          hsn: '3004',
          unit: 'strip',
          isActive: true,
        },
      }),
      prisma.medicine.create({
        data: {
          shopId: shop.id,
          name: 'Brahmi Ghee',
          company: 'Baidyanath',
          category: 'Herbal Oil',
          barcode: '8901234567891',
          hsn: '3005',
          unit: 'bottle',
          isActive: true,
        },
      }),
      prisma.medicine.create({
        data: {
          shopId: shop.id,
          name: 'Triphala Powder',
          company: 'Himalaya',
          category: 'Herbal Powder',
          barcode: '8901234567892',
          hsn: '3006',
          unit: 'packet',
          isActive: true,
        },
      }),
      prisma.medicine.create({
        data: {
          shopId: shop.id,
          name: 'Shilajit Gold Capsule',
          company: 'Dabur',
          category: 'Health Supplement',
          barcode: '8901234567893',
          hsn: '3007',
          unit: 'strip',
          isActive: true,
        },
      }),
      prisma.medicine.create({
        data: {
          shopId: shop.id,
          name: 'Neem Tablets',
          company: 'Sri Ganga',
          category: 'Herbal Supplement',
          barcode: '8901234567894',
          hsn: '3008',
          unit: 'strip',
          isActive: true,
        },
      }),
    ]);
    console.log('✓ Created', medicines.length, 'medicines');

    // 6. Create Inventory Batches (with FEFO)
    const today = new Date();
    const batches = await Promise.all([
      // Ashwagandha batches (FEFO: earliest expiry first)
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[0].id,
          batchNumber: 'ASH-20250601',
          expiryDate: new Date(today.getFullYear(), today.getMonth() + 6, 1),
          stockQty: 50,
          mrp: 500,
          purchaseRate: 350,
          sellingRate: 450,
          rackLocation: 'A-1-1',
        },
      }),
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[0].id,
          batchNumber: 'ASH-20251201',
          expiryDate: new Date(today.getFullYear() + 1, today.getMonth() + 0, 1),
          stockQty: 100,
          mrp: 500,
          purchaseRate: 350,
          sellingRate: 450,
          rackLocation: 'A-1-1',
        },
      }),
      // Brahmi batches
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[1].id,
          batchNumber: 'BRM-20250815',
          expiryDate: new Date(today.getFullYear(), today.getMonth() + 8, 15),
          stockQty: 30,
          mrp: 300,
          purchaseRate: 200,
          sellingRate: 280,
          rackLocation: 'A-1-2',
        },
      }),
      // Triphala batches
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[2].id,
          batchNumber: 'TRI-20250930',
          expiryDate: new Date(today.getFullYear(), today.getMonth() + 9, 30),
          stockQty: 75,
          mrp: 250,
          purchaseRate: 150,
          sellingRate: 220,
          rackLocation: 'A-2-1',
        },
      }),
      // Shilajit batches
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[3].id,
          batchNumber: 'SHI-20251215',
          expiryDate: new Date(today.getFullYear() + 1, today.getMonth() + 3, 15),
          stockQty: 60,
          mrp: 450,
          purchaseRate: 300,
          sellingRate: 400,
          rackLocation: 'B-1-1',
        },
      }),
      // Neem batches
      prisma.inventoryBatch.create({
        data: {
          shopId: shop.id,
          medicineId: medicines[4].id,
          batchNumber: 'NIM-20251031',
          expiryDate: new Date(today.getFullYear(), today.getMonth() + 10, 31),
          stockQty: 120,
          mrp: 200,
          purchaseRate: 100,
          sellingRate: 180,
          rackLocation: 'B-1-2',
        },
      }),
    ]);
    console.log('✓ Created', batches.length, 'inventory batches (FEFO ready)');

    // 7. Create Suppliers
    const suppliers = await Promise.all([
      prisma.supplier.create({
        data: {
          shopId: shop.id,
          name: 'Patanjali Ayurved Ltd',
          phone: '9876543210',
          email: 'supply@patanjali.com',
          address: 'Haridwar, Uttarakhand',
          gstin: '05AABCT1234H1Z0',
        },
      }),
      prisma.supplier.create({
        data: {
          shopId: shop.id,
          name: 'Baidyanath Ayurveda',
          phone: '9876543211',
          email: 'supply@baidyanath.com',
          address: 'Kolkata, West Bengal',
          gstin: '19AABCU1234H1Z5',
        },
      }),
    ]);
    console.log('✓ Created', suppliers.length, 'suppliers');

    // 8. Create Sample Customers
    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          shopId: shop.id,
          name: 'Rajesh Kumar',
          phone: '9876543220',
          address: 'Mumbai, Maharashtra',
        },
      }),
      prisma.customer.create({
        data: {
          shopId: shop.id,
          name: 'Priya Sharma',
          phone: '9876543221',
          address: 'Delhi, NCR',
        },
      }),
    ]);
    console.log('✓ Created', customers.length, 'customers');

    // 9. Create Sample Sale (Demo)
    const sale = await prisma.sale.create({
      data: {
        shopId: shop.id,
        customerId: customers[0].id,
        saleType: 'RETAIL',
        invoiceNumber: 'INV-DEMO-001',
        subtotal: 1000,
        discountTotal: 0,
        gstTotal: 100,
        grandTotal: 1100,
        paymentMode: 'CASH',
        createdByUserId: cashierUser.id,
        saleItems: {
          create: [
            {
              medicineId: medicines[0].id,
              batchId: batches[0].id,
              quantity: 2,
              mrp: 500,
              rate: 450,
              discount: 0,
              gst: 45,
              amount: 945,
            },
          ],
        },
      },
    });
    console.log('✓ Created sample sale:', sale.invoiceNumber);

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📝 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin:   admin@demo.com / Demo@123');
    console.log('Manager: manager@demo.com / Manager@123');
    console.log('Cashier: cashier@demo.com / Cashier@123');
    console.log('\n🔐 POS PIN Logins:');
    console.log('Admin:   1234');
    console.log('Manager: 2345');
    console.log('Cashier: 3456');
    console.log('\n🏪 Shop Details:');
    console.log('Shop ID: ', shop.id);
    console.log('GSTIN:   ', shop.gstin);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
