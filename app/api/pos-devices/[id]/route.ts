import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';

/** DELETE: revoke a paired device. Its cookie stops working immediately. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (auth.user.role !== 'ADMIN') return createErrorResponse('Forbidden - Admins only', 403);

    const { id } = await params;
    const device = await prisma.posDevice.findFirst({ where: { id, shopId: auth.user.shopId, revokedAt: null } });
    if (!device) return createErrorResponse('Device not found', 404);

    await prisma.posDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'POS_DEVICE_REVOKED',
        meta: JSON.stringify({ deviceId: device.id, deviceName: device.name }),
      },
    });

    return createApiResponse(true, { id: device.id });
  } catch (error) {
    console.error('Revoke POS device error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
