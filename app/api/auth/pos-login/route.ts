import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { POSLoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { UserRole } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate PIN format
    const validation = POSLoginSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid PIN', 400);
    }

    const { pin } = validation.data;

    // Find user by PIN (PIN must exist and user must be active)
    const user = await prisma.user.findFirst({
      where: {
        pin,
        isActive: true,
      },
      include: {
        shop: true,
      },
    });

    if (!user) {
      return createErrorResponse('Invalid PIN', 401);
    }

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
