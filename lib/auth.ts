import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { JWTPayload, AuthUser } from '@/types';
import { prisma } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '30d';

// Fail loudly rather than run with a weak signing key: anyone who can guess
// it can forge a token for any user.
const MIN_SECRET_LENGTH = 32;
if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Refusing to start.`);
  }
  console.warn(`⚠️ JWT_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters.`);
}

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

// Async so a hash (~250 ms at cost 12) does not block other requests.
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  expiresIn: string = JWT_EXPIRATION
): string {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, {
    algorithm: 'HS256',
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string, { algorithms: ['HS256'] }) as JWTPayload;
  } catch {
    return null;
  }
}

// Sessions are carried only by the httpOnly auth-token cookie. Bearer headers
// are not accepted: a token that page scripts can read can be stolen by XSS.
export function extractRequestToken(req: NextRequest): string | null {
  return req.cookies.get('auth-token')?.value || null;
}

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setAuthCookie(response: NextResponse, token: string, maxAge = SESSION_MAX_AGE_SECONDS) {
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

export async function getAuthUserFromToken(token: string): Promise<AuthUser | null> {
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      phone: true,
      avatarUrl: true,
      role: true,
      shopId: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  // tokenVersion is bumped on password change, deactivation and role change,
  // which ends every session issued before it.
  if (!user || !user.isActive || payload.tv !== user.tokenVersion) {
    return null;
  }

  const { tokenVersion: _tokenVersion, ...authUser } = user;
  return authUser as AuthUser;
}

export async function verifyAuth(req: NextRequest): Promise<{
  authenticated: boolean;
  user?: AuthUser;
}> {
  try {
    const token = extractRequestToken(req);
    if (!token) {
      return { authenticated: false };
    }

    const user = await getAuthUserFromToken(token);
    if (!user) {
      return { authenticated: false };
    }

    return { authenticated: true, user };
  } catch {
    return { authenticated: false };
  }
}
