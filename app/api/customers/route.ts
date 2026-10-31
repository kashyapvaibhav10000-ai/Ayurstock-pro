import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { CreateCustomerSchema, UpdateCustomerSchema } from '@/lib/schemas';

/**
 * GET /api/customers
 * List all customers for the shop
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isWholesale = searchParams.get('isWholesale');

    const customers = await prisma.customer.findMany({
      where: {
        shopId: user.shopId,
        ...(isWholesale !== null ? { isWholesale: isWholesale === 'true' } : {}),
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: customers });
  } catch (error: any) {
    console.error('Failed to fetch customers:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/customers
 * Create a new customer
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = CreateCustomerSchema.parse(body);

    const customer = await prisma.customer.create({
      data: {
        ...validatedData,
        shopId: user.shopId,
      },
    });

    return NextResponse.json({ success: true, data: customer });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

/**
 * PATCH /api/customers
 * Update customer details
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Customer ID required' }, { status: 400 });
    }

    const validatedData = UpdateCustomerSchema.parse(data);

    const customer = await prisma.customer.update({
      where: { id, shopId: user.shopId },
      data: validatedData,
    });

    return NextResponse.json({ success: true, data: customer });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
