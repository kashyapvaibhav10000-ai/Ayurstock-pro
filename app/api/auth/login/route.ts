import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateToken, verifyPassword } from '@/lib/auth';
import { LoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { UserRole } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = LoginSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse('Invalid email or password', 400);
    }

    const { email, password } = validation.data;

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        email,
      },
      include: {
        shop: true,
      },
    });

    if (!user) {
      console.log('No user found for email:', email);
      return createErrorResponse('Access denied. Contact administrator.', 401);
    }

    console.log('User found:', user?.email, 'isActive:', user?.isActive);

    // Check if user is active
    if (!user.isActive) {
      return createErrorResponse('Access denied. Contact administrator.', 401);
    }

    // Verify password
    const passwordValid = verifyPassword(password, user.passwordHash);
    console.log('Password valid:', passwordValid);
    if (!passwordValid) {
      return createErrorResponse('Access denied. Contact administrator.', 401);
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
    console.error('Login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
