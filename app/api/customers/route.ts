import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserFromToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { CreateCustomerSchema, UpdateCustomerSchema } from '@/lib/schemas';

/**
 * GET /api/customers
 * List all customers for the shop
 */
export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = (await cookieStore).get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUserFromToken(token);

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
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = (await cookieStore).get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUserFromToken(token);

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
export async function PATCH(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = (await cookieStore).get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUserFromToken(token);

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
