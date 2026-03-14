import { NextRequest } from 'next/server';
import { authenticateRequest, createErrorResponse, createPaginatedResponse, createApiResponse } from '@/middleware/auth';
import { prisma } from '@/lib/db';
import { CreateSupplierSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where: { shopId: auth.user.shopId },
        orderBy: { name: 'asc' },
        include: {
          purchases: {
            select: {
              totalAmount: true,
              status: true,
            },
          },
        },
        take: limit,
        skip: offset,
      }),
      prisma.supplier.count({ where: { shopId: auth.user.shopId } }),
    ]);

    const data = suppliers.map((supplier) => ({
      ...supplier,
      balance: supplier.purchases
        .filter((purchase) => purchase.status !== 'PAID')
        .reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0),
    }));

    return createPaginatedResponse(data, total, Math.floor(offset / limit) + 1, limit);
  } catch (error) {
    console.error('Get suppliers error:', error);
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

    // Only ADMIN and MANAGER can create suppliers
    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return createErrorResponse('Forbidden - Insufficient permissions', 403);
    }

    const body = await request.json();

    // Validate input
    const validation = CreateSupplierSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid supplier data', 400);
    }

    const { name, contactPerson, phone, email, address, city, state, gstin } = validation.data;

    // Create supplier
    const supplier = await prisma.supplier.create({
      data: {
        shopId: auth.user.shopId,
        name,
        contactPerson: contactPerson?.trim() || null,
        phone,
        email: email || '',
        address,
        city: city?.trim() || null,
        state: state?.trim() || null,
        gstin,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREATE_SUPPLIER',
        meta: JSON.stringify({
          supplierId: supplier.id,
          name: supplier.name,
        }),
      },
    });

    return createApiResponse(true, supplier, undefined, 201);
  } catch (error) {
    console.error('Create supplier error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
