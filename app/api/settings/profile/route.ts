import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { ProfileSettingsSchema } from '@/lib/schemas';
import { hashPassword } from '@/lib/auth';
import { USERNAME_TAKEN, isUsernameConflict, parseUsernameInput } from '@/lib/username';

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
        username: true,
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

    // username: omitted = unchanged, null / '' = cleared
    const parsedUsername = parseUsernameInput(validation.data.username);
    if (!parsedUsername.ok) {
      return createErrorResponse(parsedUsername.error, 400);
    }
    const username = parsedUsername.username;
    if (username) {
      const owner = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (owner && owner.id !== auth.user.id) {
        return createErrorResponse(USERNAME_TAKEN, 400);
      }
    }

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
        username,
        phone: phone ? phone.trim() : null,
        avatarUrl: avatarUrl || null,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        avatarUrl: true,
        role: true,
      },
    });

    return createApiResponse(true, updated);
  } catch (error) {
    // Lost a race with another request for the same username.
    if (isUsernameConflict(error)) {
      return createErrorResponse(USERNAME_TAKEN, 400);
    }
    console.error('Update profile settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
