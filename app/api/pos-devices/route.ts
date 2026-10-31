import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { newPairingCode, sha256 } from '@/lib/pin';
import { PAIRING_CODE_TTL_MS } from '@/lib/pos-device';

/** GET: this shop's paired POS devices (admins only). */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (auth.user.role !== 'ADMIN') return createErrorResponse('Forbidden - Admins only', 403);

    const devices = await prisma.posDevice.findMany({
      where: { shopId: auth.user.shopId },
      select: { id: true, name: true, pairedAt: true, lastUsedAt: true, revokedAt: true, lockedUntil: true },
      orderBy: { pairedAt: 'desc' },
    });
    return createApiResponse(true, devices);
  } catch (error) {
    console.error('List POS devices error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * POST { name }: one-time pairing code for a new device. The code is shown
 * once; only its hash is stored. Single use, valid for 10 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return createErrorResponse('Unauthorized', 401);
    if (auth.user.role !== 'ADMIN') return createErrorResponse('Forbidden - Admins only', 403);

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 60) return createErrorResponse('Device name is required (max 60 characters)', 400);

    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await prisma.posPairingCode.create({
      data: { shopId: auth.user.shopId, codeHash: sha256(code), deviceName: name, createdByUserId: auth.user.id, expiresAt },
    });

    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'POS_PAIRING_CODE_CREATED',
        meta: JSON.stringify({ deviceName: name, expiresAt }),
      },
    });

    return createApiResponse(true, { code, deviceName: name, expiresAt }, undefined, 201);
  } catch (error) {
    console.error('Create pairing code error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
