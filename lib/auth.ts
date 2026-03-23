import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { JWTPayload, AuthUser } from '@/types';
import { prisma } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '30d';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'development') {
  console.warn('⚠️ JWT_SECRET is not set. Authentication will not work.');
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, {
    expiresIn: JWT_EXPIRATION as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
  } catch {
    return null;
  }
}

export function extractToken(authHeader?: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token || token === 'null' || token === 'undefined') {
    return null;
  }

  return token;
}

export function extractRequestToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  const bearerToken = extractToken(authHeader);

  if (bearerToken) {
    return bearerToken;
  }

  return req.cookies.get('auth-token')?.value || null;
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
      name: true,
      phone: true,
      avatarUrl: true,
      role: true,
      shopId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user as AuthUser;
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
