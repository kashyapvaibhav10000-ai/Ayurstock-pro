import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { splitMedicineNameAndPacking } from '@/lib/medicine-importer';

interface MedicineData {
  code?: string;
  name: string;
  company: string;
  category?: string;
  packing?: string;
  mrp?: number;
  tradePrice?: number;
  hsn?: string;
  barcode?: string;
  action?: 'create' | 'update' | 'skip';
}

interface PreparedRow {
  shopId: string;
  name: string;
  company: string;
  category: string;
  barcode: string | null;
  hsn: string;
  packing: string;
  unit: string;
  isActive: boolean;
  action: 'create' | 'update' | 'skip';
}

const toKeyPart = (value: unknown) => String(value ?? '').toLowerCase();

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const user = auth.user;

    if (!['ADMIN', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { medicines }: { medicines: MedicineData[] } = await req.json();

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid medicines data' },
        { status: 400 }
      );
    }

    const rows: PreparedRow[] = medicines
      .filter((medicine) => medicine.action !== 'skip')
      .map((medicine) => {
        const split = splitMedicineNameAndPacking(medicine.name || '');
        const cleanedName = split.name || (medicine.name || '').trim();
        const cleanedPacking = split.packing || medicine.packing || '';
        return {
          shopId: user.shopId,
          name: cleanedName,
          company: (medicine.company || '').trim(),
          category: (medicine.category || 'Other').trim(),
          barcode: ((medicine.barcode || medicine.code || '').trim() || null) as string | null,
          hsn: (medicine.hsn || '').trim(),
          packing: cleanedPacking,
          unit: 'strip',
          isActive: true,
          action: medicine.action || 'create',
        };
      })
      .filter((medicine) => medicine.name && medicine.company);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No valid medicines found to import' },
        { status: 400 }
      );
    }

    const dedupedRows: PreparedRow[] = Array.from(
      new Map(
        rows.map((row) => [
          `${toKeyPart(row.name)}|${toKeyPart(row.company)}|${toKeyPart(row.barcode)}|${row.action}`,
          row,
        ])
      ).values()
    );

    const existingMedicines = await prisma.medicine.findMany({
      where: {
        shopId: user.shopId,
        OR: dedupedRows.map((row) => ({
          name: row.name,
          company: row.company,
        })),
      } as any,
      select: {
        name: true,
        company: true,
        packing: true,
      } as any,
    });

    const existingKeys = new Set(
      existingMedicines.map(
        (medicine) =>
          `${toKeyPart(medicine.name)}|${toKeyPart(medicine.company)}|${toKeyPart(medicine.packing)}`
      )
    );

    const rowsToUpdate = dedupedRows.filter(
      (row) =>
        row.action === 'update' &&
        existingKeys.has(`${toKeyPart(row.name)}|${toKeyPart(row.company)}|${toKeyPart(row.packing)}`)
    );

    const rowsToInsert = dedupedRows.filter((row) => {
      const key = `${toKeyPart(row.name)}|${toKeyPart(row.company)}|${toKeyPart(row.packing)}`;
      if (row.action === 'update') {
        return !existingKeys.has(key);
      }
      return !existingKeys.has(key);
    });

    if (rowsToInsert.length === 0 && rowsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'All medicines already exist in Medicine Master',
      });
    }

    const companyRows = Array.from(new Set(rows.map((row) => row.company)))
      .filter(Boolean)
      .map((name) => ({
        shopId: user.shopId,
        name,
      }));

    if (companyRows.length > 0) {
      const existingCompanies = await prisma.company.findMany({
        where: {
          shopId: user.shopId,
          name: { in: companyRows.map((row) => row.name) },
        },
        select: { name: true },
      });

      const existingCompanyNames = new Set(existingCompanies.map((company) => company.name));

      await prisma.company.createMany({
        data: companyRows.filter((row) => !existingCompanyNames.has(row.name)),
      });
    }

    let updatedCount = 0;
    if (rowsToUpdate.length > 0) {
      const updateOperations = rowsToUpdate.map((row) =>
        prisma.medicine.updateMany({
          where: {
            shopId: user.shopId,
            name: row.name,
            company: row.company,
            OR: [{ packing: row.packing || '' }, { packing: null }],
          } as any,
          data: {
            category: row.category,
            barcode: row.barcode,
            hsn: row.hsn,
            packing: row.packing,
          },
        })
      );
      const updateResults = await prisma.$transaction(updateOperations);
      updatedCount = updateResults.reduce((acc, item) => acc + item.count, 0);
    }

    const result = rowsToInsert.length > 0
      ? await prisma.medicine.createMany({
          data: rowsToInsert.map(({ action, ...rest }) => rest),
        })
      : { count: 0 };

    return NextResponse.json({
      success: true,
      count: result.count,
      updated: updatedCount,
      message: `Successfully imported ${result.count} medicines${updatedCount ? `, updated ${updatedCount}` : ''}`,
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to import medicines' },
      { status: 500 }
    );
  }
}
