import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest, createApiResponse, createErrorResponse } from '@/middleware/auth';
import { ProfileSettingsSchema } from '@/lib/schemas';
import { generateToken, hashPassword, setAuthCookie, verifyPassword } from '@/lib/auth';
import {
  CURRENT_PASSWORD_REQUIRED,
  CURRENT_PASSWORD_WRONG,
  PIN_TAKEN,
  parsePinInput,
  pinData,
  pinTakenInShop,
} from '@/lib/user-guards';
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
        pinHash: true,
      },
    });

    if (!user) {
      return createErrorResponse('User not found', 404);
    }

    // The PIN hash never leaves the server.
    const { pinHash, ...profile } = user;
    return createApiResponse(true, { ...profile, hasPin: Boolean(pinHash) });
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

    // POS PIN (admins only): omitted = unchanged, null / '' = removed.
    const parsedPin = parsePinInput(validation.data.pin);
    if (!parsedPin.ok) {
      return createErrorResponse(parsedPin.error, 400);
    }
    if (parsedPin.pin !== undefined && auth.user.role !== 'ADMIN') {
      return createErrorResponse('Only an Admin can change the POS PIN.', 403);
    }
    if (parsedPin.pin && (await pinTakenInShop(auth.user.shopId, parsedPin.pin, auth.user.id))) {
      return createErrorResponse(PIN_TAKEN, 400);
    }

    // Changing login identifiers or the password needs the current password.
    const current = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { email: true, username: true, passwordHash: true },
    });
    if (!current) {
      return createErrorResponse('User not found', 404);
    }
    const emailChanged = normalizedEmail !== current.email;
    const usernameChanged = username !== undefined && username !== current.username;
    if (emailChanged || usernameChanged || password) {
      const currentPassword = validation.data.currentPassword;
      if (!currentPassword) return createErrorResponse(CURRENT_PASSWORD_REQUIRED, 400);
      if (!verifyPassword(currentPassword, current.passwordHash)) return createErrorResponse(CURRENT_PASSWORD_WRONG, 400);
    }

    // Emails are unique across all shops.
    const existingUser = await prisma.user.findFirst({
      where: {
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
        ...pinData(auth.user.shopId, parsedPin.pin),
        // A new password ends every other session.
        ...(password ? { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        avatarUrl: true,
        role: true,
        pinHash: true,
        tokenVersion: true,
      },
    });

    const { pinHash, tokenVersion, ...profile } = updated;
    const response = createApiResponse(true, { ...profile, hasPin: Boolean(pinHash) });
    if (password) {
      // Keep this session alive: re-issue its token with the new version.
      const token = generateToken({ userId: auth.user.id, shopId: auth.user.shopId, email: profile.email, role: auth.user.role, tv: tokenVersion });
      setAuthCookie(response, token);
    }
    return response;
  } catch (error) {
    // Lost a race with another request for the same username.
    if (isUsernameConflict(error)) {
      return createErrorResponse(USERNAME_TAKEN, 400);
    }
    console.error('Update profile settings error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}
