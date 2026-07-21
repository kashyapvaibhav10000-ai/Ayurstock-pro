import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    // Available to every role that can access billing (ADMIN, MANAGER, CASHIER)
    // so the Company_Filter on the Billing Page works for all users, not just admins.

    const shopId = auth.user.shopId;

    const groups = await prisma.medicine.groupBy({
      by: ['company'],
      where: { shopId },
      _count: { id: true },
      orderBy: { company: 'asc' },
    });

    const companies = groups.map((g) => ({
      name: g.company,
      count: g._count.id,
    }));

    return NextResponse.json({ success: true, companies });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch companies' }, { status: 500 });
  }
}
