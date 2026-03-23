import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createErrorResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const query = (request.nextUrl.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10', 10), 20);

    if (!query) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    if (query.length >= 6) {
      const exactBatch = await prisma.inventoryBatch.findMany({
        where: {
          shopId: auth.user.shopId,
          stockQty: { gt: 0 },
          expiryDate: { gt: new Date() },
          OR: [
            { batchNumber: query },
            { medicine: { barcode: query } },
          ],
        },
        include: {
          medicine: {
            select: {
              id: true,
              name: true,
              company: true,
              barcode: true,
              gstPercent: true,
            },
          },
        },
        orderBy: [{ expiryDate: 'asc' }],
        take: limit,
      });

      if (exactBatch.length > 0) {
        return NextResponse.json({
          success: true,
          data: exactBatch.map((batch) => ({
            id: batch.id,
            batchId: batch.id,
            medicineId: batch.medicine.id,
            name: batch.medicine.name,
            company: batch.medicine.company,
            barcode: batch.medicine.barcode,
            gstPercent: batch.medicine.gstPercent,
            batchNumber: batch.batchNumber,
            stockQty: batch.stockQty,
            mrp: Number(batch.mrp),
            rate: Number(batch.sellingRate),
            rackLocation: batch.rackLocation,
            expiryDate: batch.expiryDate,
          })),
        });
      }
    }

    const results = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        stockQty: { gt: 0 },
        expiryDate: { gt: new Date() },
        OR: [
          {
            medicine: {
              name: {
                contains: query,
              },
            },
          },
          {
            medicine: {
              barcode: query,
            },
          },
          {
            batchNumber: {
              contains: query,
            },
          },
        ],
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            company: true,
            barcode: true,
            gstPercent: true,
          },
        },
      },
      orderBy: [{ expiryDate: 'asc' }, { stockQty: 'desc' }],
      take: limit,
    });

    const normalizedQuery = query.toLowerCase();
    const hasBatchNumberMatch = results.some((batch) =>
      batch.batchNumber.toLowerCase().startsWith(normalizedQuery)
    );

    const fefoResults = hasBatchNumberMatch
      ? results
      : results.filter((batch, index) => {
          const firstIndex = results.findIndex(
            (candidate) => candidate.medicineId === batch.medicineId
          );
          return firstIndex === index;
        });

    return NextResponse.json({
      success: true,
      data: fefoResults.map((batch) => ({
        id: batch.id,
        batchId: batch.id,
        medicineId: batch.medicine.id,
        name: batch.medicine.name,
        company: batch.medicine.company,
        barcode: batch.medicine.barcode,
        gstPercent: batch.medicine.gstPercent,
        batchNumber: batch.batchNumber,
        stockQty: batch.stockQty,
        mrp: Number(batch.mrp),
        rate: Number(batch.sellingRate),
        rackLocation: batch.rackLocation,
        expiryDate: batch.expiryDate,
      })),
    });
  } catch (error) {
    console.error('Billing search error:', error);
    return createErrorResponse('Failed to search billable medicines', 500);
  }
}
