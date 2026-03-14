import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse, createPaginatedResponse } from '@/middleware/auth';
import { CreateMedicineSchema, MedicineSearchSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || '';
    const trimmedQuery = query.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate input
    const validation = MedicineSearchSchema.safeParse({ query: trimmedQuery, limit, offset });
    if (!validation.success) {
      return createErrorResponse('Invalid search parameters', 400);
    }

    if (!trimmedQuery) {
      const medicines = await prisma.medicine.findMany({
        where: {
          shopId: auth.user.shopId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          company: true,
          category: true,
          barcode: true,
          hsn: true,
          packing: true,
          unit: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      });

      const medicineIds = medicines.map((medicine) => medicine.id);
      const [stockRows, expiryRows] = await Promise.all([
        medicineIds.length === 0
          ? Promise.resolve([])
          : prisma.inventoryBatch.groupBy({
              by: ['medicineId'],
              where: {
                shopId: auth.user.shopId,
                medicineId: { in: medicineIds },
              },
              _sum: {
                stockQty: true,
              },
            }),
        medicineIds.length === 0
          ? Promise.resolve([])
          : prisma.inventoryBatch.findMany({
              where: {
                shopId: auth.user.shopId,
                medicineId: { in: medicineIds },
                stockQty: { gt: 0 },
                expiryDate: { gt: new Date() },
              },
              select: {
                medicineId: true,
                expiryDate: true,
              },
              orderBy: [{ medicineId: 'asc' }, { expiryDate: 'asc' }],
            }),
      ]);

      const stockByMedicine = new Map(
        stockRows.map((row) => [row.medicineId, row._sum.stockQty || 0])
      );
      const nextExpiryByMedicine = new Map<string, Date>();

      for (const row of expiryRows) {
        if (!nextExpiryByMedicine.has(row.medicineId)) {
          nextExpiryByMedicine.set(row.medicineId, row.expiryDate);
        }
      }

      const enrichedMedicines = medicines.map((medicine) => ({
        ...medicine,
        availableStock: stockByMedicine.get(medicine.id) || 0,
        nextExpiryDate: nextExpiryByMedicine.get(medicine.id) || null,
      }));

      return createPaginatedResponse(
        enrichedMedicines,
        enrichedMedicines.length,
        Math.floor(offset / limit) + 1,
        limit
      );
    }

    if (trimmedQuery.length < 2) {
      return createPaginatedResponse([], 0, 1, limit);
    }

    const textFilter =
      trimmedQuery.length >= 3
        ? {
            OR: [
              { name: { contains: trimmedQuery } },
              { company: { contains: trimmedQuery } },
              { barcode: trimmedQuery },
            ],
          }
        : {
            OR: [
              { name: { startsWith: trimmedQuery } },
              { company: { startsWith: trimmedQuery } },
              { barcode: trimmedQuery },
            ],
          };

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where: {
          shopId: auth.user.shopId,
          isActive: true,
          ...textFilter,
        },
        select: {
          id: true,
          name: true,
          company: true,
          category: true,
          barcode: true,
          hsn: true,
          packing: true,
          unit: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.medicine.count({
        where: {
          shopId: auth.user.shopId,
          isActive: true,
          ...textFilter,
        },
      }),
    ]);

    const medicineIds = medicines.map((medicine) => medicine.id);
    const [stockRows, expiryRows] = await Promise.all([
      medicineIds.length === 0
        ? Promise.resolve([])
        : prisma.inventoryBatch.groupBy({
            by: ['medicineId'],
            where: {
              shopId: auth.user.shopId,
              medicineId: { in: medicineIds },
            },
            _sum: {
              stockQty: true,
            },
          }),
      medicineIds.length === 0
        ? Promise.resolve([])
        : prisma.inventoryBatch.findMany({
            where: {
              shopId: auth.user.shopId,
              medicineId: { in: medicineIds },
              stockQty: { gt: 0 },
              expiryDate: { gt: new Date() },
            },
            select: {
              medicineId: true,
              expiryDate: true,
            },
            orderBy: [{ medicineId: 'asc' }, { expiryDate: 'asc' }],
          }),
    ]);

    const stockByMedicine = new Map(
      stockRows.map((row) => [row.medicineId, row._sum.stockQty || 0])
    );
    const nextExpiryByMedicine = new Map<string, Date>();

    for (const row of expiryRows) {
      if (!nextExpiryByMedicine.has(row.medicineId)) {
        nextExpiryByMedicine.set(row.medicineId, row.expiryDate);
      }
    }

    const enrichedMedicines = medicines.map((medicine) => ({
      ...medicine,
      availableStock: stockByMedicine.get(medicine.id) || 0,
      nextExpiryDate: nextExpiryByMedicine.get(medicine.id) || null,
    }));

    return createPaginatedResponse(enrichedMedicines, total, Math.floor(offset / limit) + 1, limit);
  } catch (error) {
    console.error('Search medicines error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Only ADMIN and MANAGER can create medicines
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();
    const validation = CreateMedicineSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid medicine data', 400);
    }

    const data = validation.data;

    const medicine = await prisma.medicine.create({
      data: {
        shopId: auth.user.shopId,
        name: data.name,
        company: data.company,
        category: data.category,
        barcode: data.barcode,
        hsn: data.hsn,
        packing: data.packing || null,
        unit: data.unit || 'strip',
      },
    });

    await prisma.company.upsert({
      where: {
        shopId_name: {
          shopId: auth.user.shopId,
          name: data.company,
        },
      },
      update: {},
      create: {
        shopId: auth.user.shopId,
        name: data.company,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREATE_MEDICINE',
        meta: JSON.stringify({ medicineId: medicine.id, name: medicine.name }),
      },
    });

    return createApiResponse(true, medicine, undefined, 201);
  } catch (error) {
    console.error('Create medicine error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
