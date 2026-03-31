import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse, createPaginatedResponse } from '@/middleware/auth';
import { CreateMedicineSchema, MedicineSearchSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') ?? searchParams.get('q') ?? '';
    const trimmedQuery = query.trim();
    const companyId = searchParams.get('company');
    const categoryFilter = searchParams.get('category');
    const mrpMinRaw = searchParams.get('mrp_min');
    const mrpMaxRaw = searchParams.get('mrp_max');
    const mrpMin = mrpMinRaw ? parseFloat(mrpMinRaw) : undefined;
    const mrpMax = mrpMaxRaw ? parseFloat(mrpMaxRaw) : undefined;

    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    // If query is exactly 1 character, throttle it to prevent heavy DB wildcard requests.
    // If it's 0 characters (empty string), we bypass the filter to load the complete paginated table list natively.
    if (trimmedQuery.length === 1) {
      return createPaginatedResponse([], 0, 1, limit);
    }

    let companyNameFilter;
    if (companyId) {
      const companyRec = await prisma.company.findUnique({
        where: { id: companyId, shopId: auth.user.shopId }
      });
      if (companyRec) {
        companyNameFilter = companyRec.name;
      }
    }

    let textFilter = {};
    if (trimmedQuery.length >= 2) {
      // Split query into words and match each word independently against the name
      // This ensures "AROGYAVARDHINI VATI" can still find "AROGYAVARDHINI GUTIKA (RASA)"
      const words = trimmedQuery.split(/\s+/).filter(w => w.length >= 2);
      
      if (words.length > 1) {
        // Multi-word: each word must appear in name (AND), or full query matches company/barcode
        textFilter = {
          OR: [
            {
              AND: words.map(word => ({
                name: { contains: word, mode: 'insensitive' as const },
              })),
            },
            { company: { contains: trimmedQuery, mode: 'insensitive' as const } },
            { barcode: trimmedQuery },
          ],
        };
      } else {
        // Single word: use original logic
        textFilter = trimmedQuery.length >= 3
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
                { company: { contains: trimmedQuery, mode: 'insensitive' as const } },
                { barcode: trimmedQuery },
              ],
            }
          : {
              OR: [
                { name: { startsWith: trimmedQuery, mode: 'insensitive' as const } },
                { company: { startsWith: trimmedQuery, mode: 'insensitive' as const } },
                { barcode: trimmedQuery },
              ],
            };
      }
    }

    const dateFilter = categoryFilter === 'Imported Today'
      ? { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
      : {};

    const coreWhere = {
      shopId: auth.user.shopId,
      isActive: true,
      ...textFilter,
      ...dateFilter,
      ...(companyNameFilter ? { company: companyNameFilter } : {}),
      ...(categoryFilter && categoryFilter !== 'All' && categoryFilter !== 'Imported Today'
          ? { category: { equals: categoryFilter, mode: 'insensitive' as const } }
          : {}),
      ...(mrpMin !== undefined || mrpMax !== undefined
          ? { mrp: { ...(mrpMin !== undefined ? { gte: mrpMin } : {}), ...(mrpMax !== undefined ? { lte: mrpMax } : {}) } }
          : {}),
    };

    console.log('Fetching medicines for shopId:', auth.user.shopId);

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where: coreWhere,
        select: {
          id: true,
          name: true,
          company: true,
          category: true,
          barcode: true,
          hsn: true,
          packing: true,
          unit: true,
          gstPercent: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.medicine.count({
        where: coreWhere,
      }),
    ]);

    console.log(`🔍 [Search API] Query: "${trimmedQuery}", Found: ${medicines.length} / ${total}`);

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
        gstPercent: typeof (body as any).gstPercent === 'number' ? (body as any).gstPercent : 0,
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
