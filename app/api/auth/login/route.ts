import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateToken, hashPassword, verifyPassword } from '@/lib/auth';
import { LoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeUsername, usernameError } from '@/lib/username';
import { UserRole } from '@/types';

// Never say which part was wrong.
const INVALID_CREDENTIALS = 'Invalid credentials';

// Compared against when no user matches, so an unknown identifier costs the
// same bcrypt time as a wrong password.
const DUMMY_HASH = hashPassword('not-a-real-password-for-timing-only');

/** Username or email: an "@" means email; both match case-insensitively. */
async function findLoginUser(identifier: string) {
  if (identifier.includes('@')) {
    return prisma.user.findFirst({
      where: { email: { equals: identifier, mode: 'insensitive' } },
      include: { shop: true },
    });
  }
  const username = normalizeUsername(identifier);
  if (usernameError(username)) return null;
  return prisma.user.findUnique({ where: { username }, include: { shop: true } });
}

export async function POST(request: NextRequest) {
  try {
    // Throttle repeated login attempts from the same IP to slow brute-forcing.
    const ip = getClientIp(request);
    const limit = rateLimit(`login:${ip}`, 10, 60_000);
    if (!limit.allowed) {
      return createErrorResponse(
        `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
        429
      );
    }

    const body = await request.json().catch(() => null);

    // Validate input
    const validation = LoginSchema.safeParse(body);
    if (!validation.success) {
      return createErrorResponse(INVALID_CREDENTIALS, 400);
    }

    const { password } = validation.data;
    const identifier = (validation.data.identifier || validation.data.email)!.trim().toLowerCase();

    // Also throttle per account, so attempts spread over many IPs still slow down.
    const accountLimit = rateLimit(`login-id:${identifier}`, 20, 15 * 60_000);
    if (!accountLimit.allowed) {
      return createErrorResponse(
        `Too many login attempts. Try again in ${accountLimit.retryAfterSeconds}s.`,
        429
      );
    }

    const user = await findLoginUser(identifier);

    if (!user) {
      // Can't log to LoginHistory without a userId FK
      verifyPassword(password, DUMMY_HASH);
      return createErrorResponse(INVALID_CREDENTIALS, 401);
    }

    const logAttempt = (status: 'success' | 'failed') =>
      prisma.loginHistory.create({
        data: {
          userId: user.id,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          userAgent: request.headers.get('user-agent'),
          status,
          identifier,
        },
      });

    // Verify password
    const passwordValid = verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await logAttempt('failed').catch(console.error);
      return createErrorResponse(INVALID_CREDENTIALS, 401);
    }

    // Check if user is active (only after the password, so this reveals nothing to a guesser)
    if (!user.isActive) {
      await logAttempt('failed').catch(console.error);
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
    await logAttempt('success');

    const response = NextResponse.json(
      {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
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
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
