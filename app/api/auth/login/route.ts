import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST, generateToken, setAuthCookie, verifyPassword } from '@/lib/auth';
import { LoginSchema } from '@/lib/schemas';
import { createErrorResponse } from '@/middleware/auth';
import { rateLimit, rateLimitExceeded, getClientIp } from '@/lib/rate-limit';
import { normalizeUsername, usernameError } from '@/lib/username';
import { UserRole } from '@/types';

// Never say which part was wrong.
const INVALID_CREDENTIALS = 'Invalid credentials';

// Failed logins per account before it is locked for the rest of the window.
const ACCOUNT_FAILURE_LIMIT = 20;
const ACCOUNT_FAILURE_WINDOW_MS = 15 * 60_000;

// Compared against when no user matches, so an unknown identifier costs the
// same bcrypt time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-for-timing-only', BCRYPT_COST);

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
    const limit = await rateLimit(`login:${ip}`, 10, 60_000);
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

    // Also throttle per account, so attempts spread over many IPs still slow
    // down. Only failed attempts count (see countFailure), so a user's own
    // successful logins never lock them out.
    const accountKey = `login-id:${identifier}`;
    const countFailure = () => rateLimit(accountKey, ACCOUNT_FAILURE_LIMIT, ACCOUNT_FAILURE_WINDOW_MS);
    const accountLimit = await rateLimitExceeded(accountKey, ACCOUNT_FAILURE_LIMIT);
    if (accountLimit) {
      return createErrorResponse(
        `Too many login attempts. Try again in ${accountLimit.retryAfterSeconds}s.`,
        429
      );
    }

    const user = await findLoginUser(identifier);

    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      await countFailure();
      // Record the typed identifier (never the password) so guessing at
      // accounts shows up; no user, so no shop either.
      await prisma.loginHistory
        .create({
          data: { ipAddress: ip, userAgent: request.headers.get('user-agent'), status: 'failed', identifier: identifier.slice(0, 254) },
        })
        .catch(console.error);
      return createErrorResponse(INVALID_CREDENTIALS, 401);
    }

    const logAttempt = (status: 'success' | 'failed') =>
      prisma.loginHistory.create({
        data: {
          userId: user.id,
          shopId: user.shopId,
          ipAddress: ip,
          userAgent: request.headers.get('user-agent'),
          status,
          identifier,
        },
      });

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await countFailure();
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
      tv: user.tokenVersion,
    });

    // Log login
    await logAttempt('success');

    const response = NextResponse.json(
      {
        success: true,
        data: {
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

    setAuthCookie(response, token);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
