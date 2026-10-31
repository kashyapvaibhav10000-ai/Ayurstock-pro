import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { supplierFields } from '@/lib/schemas';
import { verifyAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const suppliers = await prisma.supplier.findMany({
      where: { shopId: auth.user.shopId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { purchases: true }
        }
      }
    });

    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user || !['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const fields = supplierFields(await req.json().catch(() => null));
    if (!fields?.name) {
      return NextResponse.json({ success: false, message: 'Supplier name is required' }, { status: 400 });
    }
    const supplier = await prisma.supplier.create({
      data: {
        phone: '',
        email: '',
        address: '',
        ...fields,
        name: fields.name,
        shopId: auth.user.shopId,
      }
    });

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Failed to create supplier' }, { status: 500 });
  }
}
