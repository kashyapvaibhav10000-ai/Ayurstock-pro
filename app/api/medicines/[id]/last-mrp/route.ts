import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await authenticateRequest(req);
    if (!auth) return createErrorResponse('Unauthorized', 401);

    const latestBatch = await prisma.inventoryBatch.findFirst({
      where: {
        shopId: auth.user.shopId,
        medicineId: id
      },
      orderBy: { createdAt: 'desc' },
      select: { mrp: true }
    });

    return createApiResponse(true, { mrp: latestBatch?.mrp || '' });
  } catch (error) {
    console.error('Fetch last MRP error', error);
    return createErrorResponse('Internal error', 500);
  }
}
