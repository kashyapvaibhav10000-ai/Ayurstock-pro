import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { ProfileSettingsSchema } from '@/lib/schemas';
import { hashPassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (!user) {
      return createErrorResponse('User not found', 404);
    }

    return createApiResponse(true, user);
  } catch (error) {
    console.error('Get profile settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const validation = ProfileSettingsSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      return createErrorResponse(`Validation error: ${JSON.stringify(errors)}`, 400);
    }

    const { name, email, phone, password, avatarUrl } = validation.data;

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        shopId: auth.user.shopId,
        email: normalizedEmail,
        NOT: { id: auth.user.id },
      },
      select: { id: true },
    });

    if (existingUser) {
      return createErrorResponse('Email already in use for another user', 400);
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone ? phone.trim() : null,
        avatarUrl: avatarUrl || null,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });

    return createApiResponse(true, updated);
  } catch (error) {
    console.error('Update profile settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
