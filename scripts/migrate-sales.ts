import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

const DRY_RUN = false;

async function migrate() {
  console.log('----------------------------------------------------------');
  console.log(`Ayur-Stock Pro: Sale Total Recalculation (Inclusive MRP)`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (No database changes)' : 'LIVE UPDATE'}`);
  console.log('----------------------------------------------------------\n');
  
  const sales = await prisma.sale.findMany({
    include: {
      saleItems: true,
    },
  });

  console.log(`Found ${sales.length} sales. Starting audit...\n`);

  let correctedCount = 0;

  for (const sale of sales) {
    let newSubtotal = new Decimal(0);
    let newGstTotal = new Decimal(0);
    const discountTotal = new Decimal(sale.discountTotal || 0);

    for (const item of sale.saleItems) {
      // 1. Total inclusive amount for this item
      const itemInclusiveTotal = new Decimal(item.quantity).times(new Decimal(item.rate));
      
      // 2. Apply item-level discount (on inclusive price)
      const itemDiscount = new Decimal(item.discount || 0);
      const itemAfterDiscount = itemInclusiveTotal.minus(itemDiscount);
      
      // 3. Extract GST from the inclusive after-discount price
      // Formula: (Price / (100 + GST%)) * GST%
      const gstPercent = new Decimal(item.gstPercent || 0);
      const gstFactor = gstPercent.dividedBy(new Decimal(100).plus(gstPercent));
      const itemGst = itemAfterDiscount.times(gstFactor);
      
      newSubtotal = newSubtotal.plus(itemInclusiveTotal);
      newGstTotal = newGstTotal.plus(itemGst);
    }

    // 4. Final Grand Total = Inclusive Subtotal - Global Discount
    const newGrandTotal = newSubtotal.minus(discountTotal);

    const currentTotalVal = new Decimal(sale.grandTotal).toNumber();
    const newTotalVal = newGrandTotal.toNumber();
    
    const diff = Math.abs(currentTotalVal - newTotalVal);

    if (diff > 0.01) {
      correctedCount++;
      console.log(`[CORRECTION] Inv: ${sale.invoiceNumber.padEnd(10)} | Old: ₹${currentTotalVal.toFixed(2).padStart(8)} | New: ₹${newTotalVal.toFixed(2).padStart(8)} | GST: ₹${newGstTotal.toFixed(2).padStart(8)}`);
      
      if (!DRY_RUN) {
        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            subtotal: newSubtotal,
            gstTotal: newGstTotal,
            grandTotal: newGrandTotal,
          },
        });
      }
    } else {
      console.log(`[OK]         Inv: ${sale.invoiceNumber.padEnd(10)} | Current: ₹${currentTotalVal.toFixed(2).padStart(8)}`);
    }
  }

  console.log(`\n----------------------------------------------------------`);
  console.log(`Audit Summary:`);
  console.log(`Total Sales Processed: ${sales.length}`);
  console.log(`Anomalies Found:       ${correctedCount}`);
  if (DRY_RUN) {
    console.log(`Status:                NO CHANGES APPLIED (Dry Run)`);
  } else {
    console.log(`Status:                DATABASE UPDATED SUCCESSFULLY`);
  }
  console.log('----------------------------------------------------------');
}

migrate()
  .catch((e: any) => {
    console.error('\n[ERROR] Migration failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
