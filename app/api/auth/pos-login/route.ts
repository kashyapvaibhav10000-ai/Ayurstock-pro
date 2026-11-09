import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { POSLoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { hashPin } from '@/lib/pin';
import { PIN_LOCKOUT_MS, PIN_MAX_FAILURES, getRequestDevice } from '@/lib/pos-device';
import { UserRole } from '@/types';

// A POS session lasts one shift and is never extended by the sliding refresh.
const POS_SESSION_SECONDS = 60 * 60 * 12;

const INVALID_PIN = 'Invalid PIN';

function lockedResponse(until: Date) {
  const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  return createErrorResponse(`Too many wrong PINs on this device. Try again in ${seconds}s.`, 429);
}

/**
 * PIN login. Only works from a paired device (lib/pos-device.ts) and only
 * looks up users of that device's shop. Wrong PINs lock the device after
 * PIN_MAX_FAILURES; the lock is stored on the device row so it survives
 * restarts. The caller's IP is throttled as well.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limit = await rateLimit(`pos-login:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return createErrorResponse(`Too many PIN attempts. Try again in ${limit.retryAfterSeconds}s.`, 429);
    }

    const device = await getRequestDevice(request);
    if (!device) {
      return NextResponse.json(
        { success: false, error: 'This device is not paired for PIN login. Ask an admin to pair it.', code: 'DEVICE_NOT_PAIRED' },
        { status: 401 }
      );
    }
    const body = await request.json().catch(() => null);
    const validation = POSLoginSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse(INVALID_PIN, 401);
    }

    // Reserve this attempt before checking the PIN: one conditional UPDATE, so
    // parallel guesses cannot all slip in before the lock is written.
    const reserved = await prisma.posDevice.updateMany({
      where: {
        id: device.id,
        failedPinCount: { lt: PIN_MAX_FAILURES },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
      },
      data: { failedPinCount: { increment: 1 } },
    });
    if (reserved.count === 0) {
      const current = await prisma.posDevice.findUnique({ where: { id: device.id }, select: { lockedUntil: true } });
      return lockedResponse(current?.lockedUntil && current.lockedUntil > new Date() ? current.lockedUntil : new Date(Date.now() + PIN_LOCKOUT_MS));
    }

    const user = await prisma.user.findFirst({
      where: { shopId: device.shopId, pinHash: hashPin(device.shopId, validation.data.pin), isActive: true },
      include: { shop: true },
    });

    if (!user) {
      await prisma.loginHistory
        .create({
          data: {
            shopId: device.shopId,
            ipAddress: ip,
            userAgent: request.headers.get('user-agent'),
            status: 'failed',
            identifier: `pos-device:${device.name}`,
          },
        })
        .catch(console.error);
      // The attempt was counted when reserved; the one that reaches the limit sets the lock.
      const updated = await prisma.posDevice.findUniqueOrThrow({
        where: { id: device.id },
        select: { failedPinCount: true },
      });
      if (updated.failedPinCount >= PIN_MAX_FAILURES) {
        const lockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS);
        await prisma.posDevice.update({ where: { id: device.id }, data: { lockedUntil, failedPinCount: 0 } });
        await prisma.activityLog
          .create({
            data: {
              shopId: device.shopId,
              action: 'POS_DEVICE_LOCKED',
              meta: JSON.stringify({ deviceId: device.id, deviceName: device.name, ip }),
            },
          })
          .catch(console.error);
        return lockedResponse(lockedUntil);
      }
      return createErrorResponse(INVALID_PIN, 401);
    }

    // Admins sign in with their password; a 4-digit PIN must not open an admin session.
    if (user.role === 'ADMIN') {
      return createErrorResponse('Admins must sign in with their password.', 403);
    }

    await prisma.posDevice.update({
      where: { id: device.id },
      data: { failedPinCount: 0, lockedUntil: null, lastUsedAt: new Date() },
    });

    const token = generateToken(
      {
        userId: user.id,
        shopId: user.shopId,
        email: user.email,
        role: user.role as UserRole,
        tv: user.tokenVersion,
        pos: true,
      },
      `${POS_SESSION_SECONDS}s`
    );

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        shopId: user.shopId,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent'),
        status: 'success',
        identifier: `pos-device:${device.name}`,
      },
    });

    const response = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            avatarUrl: user.avatarUrl,
            role: user.role,
            isActive: user.isActive,
            shopId: user.shopId,
            shop: {
              id: user.shop.id,
              name: user.shop.name,
            },
          },
        },
      },
      { status: 200 }
    );

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: POS_SESSION_SECONDS,
    });

    return response;
  } catch (error) {
    console.error('POS login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
