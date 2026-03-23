import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = authResult.user!;

    // Check authorization
    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const {
      medicines,
    }: {
      medicines: Array<{
        name: string;
        company: string;
        category?: string;
        barcode?: string;
        hsn?: string;
        packing?: string;
        mrp?: number;
        tradePrice?: number;
      }>;
    } = await req.json();

    if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No medicines provided' },
        { status: 400 }
      );
    }

    const normalizedMedicines = medicines
      .map((med) => ({
        name: (med.name || '').trim(),
        company: (med.company || '').trim(),
        category: (med.category || 'Other').trim(),
        barcode: (med.barcode || '').trim(),
        hsn: (med.hsn || '').trim(),
        packing: (med.packing || '').trim(),
        mrp: typeof med.mrp === 'number' && Number.isFinite(med.mrp) ? med.mrp : undefined,
        tradePrice:
          typeof med.tradePrice === 'number' && Number.isFinite(med.tradePrice)
            ? med.tradePrice
            : undefined,
      }))
      .filter((med) => med.name);

    const seenBarcodes = new Map<string, string>();
    const sanitizedMedicines = normalizedMedicines.map((med) => {
      if (!med.barcode) {
        return med;
      }

      const key = med.barcode.toLowerCase();
      const identity = `${med.name.toLowerCase()}|${med.company.toLowerCase()}`;
      const existingIdentity = seenBarcodes.get(key);

      if (!existingIdentity) {
        seenBarcodes.set(key, identity);
        return med;
      }

      if (existingIdentity === identity) {
        return med;
      }

      return {
        ...med,
        barcode: '',
      };
    });

    console.log('Auth shopId:', user.shopId);
    console.log(`📦 [Bulk Insert API] Saving ${sanitizedMedicines.length} medicines to Database for shopId: ${user.shopId}`);

    let createdMedicineCount = 0;
    let updatedMedicineCount = 0;
    let skippedBarcodeCount = 0;
    let errorCount = 0;

    const uniqueCompanies = Array.from(
      new Set(sanitizedMedicines.map((medicine) => medicine.company).filter(Boolean))
    );

    for (const companyName of uniqueCompanies) {
      try {
        await prisma.company.upsert({
          where: {
            shopId_name: {
              shopId: user.shopId,
              name: companyName,
            },
          },
          update: {},
          create: {
            shopId: user.shopId,
            name: companyName,
          },
        });
      } catch (e) {
        console.error(`Failed to upsert company ${companyName}:`, e);
      }
    }

    for (let index = 0; index < sanitizedMedicines.length; index += 1) {
      const normalized = sanitizedMedicines[index];
      const original = normalizedMedicines[index];

      try {
        if (original.barcode && !normalized.barcode) {
          skippedBarcodeCount += 1;
        }

        // 1. Try to find by barcode if available
        let medicine = normalized.barcode
          ? await prisma.medicine.findFirst({
              where: {
                shopId: user.shopId,
                barcode: normalized.barcode,
              },
            })
          : null;

        // 2. Fallback to name/company/packing/shopId if not found or no barcode
        if (!medicine) {
          medicine = await prisma.medicine.findFirst({
            where: {
              shopId: user.shopId,
              name: normalized.name,
              company: normalized.company,
              packing: normalized.packing || null,
            },
          });
        }

        if (!medicine) {
          // CREATE
          medicine = await prisma.medicine.create({
            data: {
              shopId: user.shopId,
              name: normalized.name,
              company: normalized.company,
              category: normalized.category,
              barcode: normalized.barcode || null,
              hsn: normalized.hsn,
              packing: normalized.packing || null,
              unit: 'strip',
              isActive: true,
            },
          });
          createdMedicineCount += 1;
          console.log(`Saved (NEW): ${medicine.name} | Packing: ${medicine.packing}`);
        } else {
          // UPDATE if needed
          const shouldUpdate =
            (!medicine.category && normalized.category) ||
            (!medicine.hsn && normalized.hsn) ||
            (!medicine.barcode && normalized.barcode) ||
            (!medicine.packing && normalized.packing);

          if (shouldUpdate) {
            medicine = await prisma.medicine.update({
              where: { id: medicine.id },
              data: {
                category: medicine.category || normalized.category,
                hsn: medicine.hsn || normalized.hsn,
                barcode: medicine.barcode || normalized.barcode || null,
                packing: medicine.packing || normalized.packing || null,
              },
            });
            updatedMedicineCount += 1;
            console.log(`Saved (UPDATED): ${medicine.name}`);
          } else {
            console.log(`Skipped (EXISTS): ${medicine.name}`);
          }
        }
      } catch (error: any) {
        errorCount += 1;
        console.log(`FAILED: ${normalized.name} | Error: ${error.message}`);
      }
    }

    const result = {
      createdMedicineCount,
      updatedMedicineCount,
      skippedBarcodeCount,
      errorCount
    };

    return NextResponse.json({
      success: true,
      data: result,
      message: `Imported ${result.createdMedicineCount} medicines and updated ${result.updatedMedicineCount}`,
    });
  } catch (error) {
    console.error('Bulk insert error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to import medicines',
      },
      { status: 500 }
    );
  }
}
