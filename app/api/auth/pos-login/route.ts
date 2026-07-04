import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { POSLoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { UserRole } from '@/types';

export async function POST(request: NextRequest) {
  try {
    // A 4-digit PIN only has 10k combinations, so throttle aggressively.
    const ip = getClientIp(request);
    const limit = rateLimit(`pos-login:${ip}`, 5, 60_000);
    if (!limit.allowed) {
      return createErrorResponse(
        `Too many PIN attempts. Try again in ${limit.retryAfterSeconds}s.`,
        429
      );
    }

    const body = await request.json();

    // Validate PIN format
    const validation = POSLoginSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid PIN', 400);
    }

    const { pin } = validation.data;

    // Find ALL active users matching this PIN. A 4-digit PIN is not globally
    // unique across tenants, so if more than one active user shares it we cannot
    // safely decide which shop to log into — reject rather than risk logging the
    // cashier into the WRONG shop's data.
    const matches = await prisma.user.findMany({
      where: {
        pin,
        isActive: true,
      },
      include: {
        shop: true,
      },
      take: 2,
    });

    if (matches.length === 0) {
      return createErrorResponse('Invalid PIN', 401);
    }

    if (matches.length > 1) {
      // Ambiguous PIN across shops/users — refuse to guess.
      return createErrorResponse('PIN is not unique. Please log in with email and password.', 409);
    }

    const user = matches[0];

    // Generate token
    const token = generateToken({
      userId: user.id,
      shopId: user.shopId,
      email: user.email,
      role: user.role as UserRole,
    });

    // Log login
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
        status: 'success',
      },
    });

    const response = NextResponse.json(
      {
        success: true,
        data: {
          token,
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
      maxAge: 60 * 15,
    });

    return response;
  } catch (error) {
    console.error('POS login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
