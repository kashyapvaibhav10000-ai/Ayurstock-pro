import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createErrorResponse } from '@/middleware/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { newDeviceToken, normalizePairingCode, sha256 } from '@/lib/pin';
import { clearDeviceCookie, getRequestDevice, setDeviceCookie } from '@/lib/pos-device';

/** GET: is this browser a paired POS device? (login screen shows PIN pad only then) */
export async function GET(request: NextRequest) {
  try {
    const device = await getRequestDevice(request);
    if (!device) return NextResponse.json({ success: true, data: { paired: false } });
    return NextResponse.json({
      success: true,
      data: { paired: true, deviceName: device.name, shopName: device.shop.name },
    });
  } catch (error) {
    console.error('POS device status error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/**
 * POST { code }: redeem a one-time pairing code an admin generated in
 * Settings > POS Devices. Each code works once, within 10 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = await rateLimit(`pos-pair:${ip}`, 10, 10 * 60_000);
    if (!limit.allowed) {
      return createErrorResponse(`Too many pairing attempts. Try again in ${limit.retryAfterSeconds}s.`, 429);
    }

    const body = await request.json().catch(() => null);
    const code = normalizePairingCode(body?.code);
    if (!code) return createErrorResponse('Invalid or expired pairing code', 400);

    const token = newDeviceToken();
    const device = await prisma.$transaction(async (tx) => {
      const pairing = await tx.posPairingCode.findUnique({ where: { codeHash: sha256(code) } });
      if (!pairing) return null;
      // Claim the code in one conditional UPDATE so two devices racing for
      // the same code cannot both win.
      const claimed = await tx.posPairingCode.updateMany({
        where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return tx.posDevice.create({
        data: {
          shopId: pairing.shopId,
          name: pairing.deviceName,
          tokenHash: sha256(token),
          pairedByUserId: pairing.createdByUserId,
        },
        include: { shop: { select: { name: true } } },
      });
    });

    if (!device) return createErrorResponse('Invalid or expired pairing code', 400);

    await prisma.activityLog
      .create({
        data: {
          shopId: device.shopId,
          userId: device.pairedByUserId,
          action: 'POS_DEVICE_PAIRED',
          meta: JSON.stringify({ deviceId: device.id, deviceName: device.name, ip }),
        },
      })
      .catch(console.error);

    const response = NextResponse.json({
      success: true,
      data: { paired: true, deviceName: device.name, shopName: device.shop.name },
    });
    setDeviceCookie(response, token);
    return response;
  } catch (error) {
    console.error('POS pairing error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

/** DELETE: forget the pairing on this browser (the admin can also revoke it). */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearDeviceCookie(response);
  return response;
}
