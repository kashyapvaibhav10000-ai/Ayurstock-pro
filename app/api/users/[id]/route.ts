import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyAuth, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { USERNAME_TAKEN, isUsernameConflict, parseUsernameInput } from '@/lib/username';
import {
  CURRENT_PASSWORD_REQUIRED,
  CURRENT_PASSWORD_WRONG,
  LastAdminError,
  PIN_TAKEN,
  parsePinInput,
  pinData,
  pinTakenInShop,
  updateUserKeepingAnAdmin,
} from '@/lib/user-guards';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  pinHash: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

/** Never send the PIN hash to the browser. */
function publicUser<T extends { pinHash: string | null }>({ pinHash, ...user }: T) {
  return { ...user, hasPin: Boolean(pinHash) };
}

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/** Errors any user write can raise, as clear 400/409 responses. */
function writeError(error: unknown) {
  if (error instanceof LastAdminError) return fail(error.message);
  if (isUsernameConflict(error)) return fail(USERNAME_TAKEN);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Another admin change ran at the same moment; the last-admin check could not be confirmed.
    if (error.code === 'P2034') return fail('Another change to this shop\'s admins happened at the same time. Try again.', 409);
    if (error.code === 'P2002') return fail('This email is already in use.');
  }
  return null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return fail('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN') {
      return fail('Forbidden: Admins only', 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request body');
    const { name, email, role, isActive, phone, currentPassword } = body;

    if (!userId) {
      return fail('User ID is required');
    }

    // Security: Fetch target user and ensure they belong to the same shop!
    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        shopId: auth.user.shopId
      }
    });

    if (!targetUser) {
      return fail('User not found', 404);
    }

    const isSelf = targetUser.id === auth.user.id;

    // Role Escalation Guard: an admin manages their own account, never another admin's.
    if (targetUser.role === 'ADMIN' && !isSelf) {
      return fail('Cannot edit another Admin account', 403);
    }

    // Security: Ensure only valid roles are assigned
    const validRoles = ['ADMIN', 'MANAGER', 'CASHIER'];
    if (role !== undefined && !validRoles.includes(role)) {
      return fail('Invalid role provided');
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return fail('isActive must be true or false');
    }

    const normalizedEmail = typeof email === 'string' && email.trim() ? email.toLowerCase().trim() : undefined;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return fail('Invalid email address');
    }

    // username: undefined = unchanged, null / '' = cleared
    const parsedUsername = parseUsernameInput(body.username);
    if (!parsedUsername.ok) {
      return fail(parsedUsername.error);
    }
    const username = parsedUsername.username;
    if (username) {
      const owner = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (owner && owner.id !== userId) {
        return fail(USERNAME_TAKEN);
      }
    }

    const parsedPin = parsePinInput(body.pin);
    if (!parsedPin.ok) return fail(parsedPin.error);
    if (parsedPin.pin && (await pinTakenInShop(auth.user.shopId, parsedPin.pin, userId))) {
      return fail(PIN_TAKEN);
    }

    if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.trim().length > 20)) {
      return fail('Invalid phone number');
    }

    // Changing your own login identifiers needs your current password.
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== targetUser.email;
    const usernameChanged = username !== undefined && username !== targetUser.username;
    if (isSelf && (emailChanged || usernameChanged)) {
      if (typeof currentPassword !== 'string' || !currentPassword) return fail(CURRENT_PASSWORD_REQUIRED);
      if (!verifyPassword(currentPassword, targetUser.passwordHash)) return fail(CURRENT_PASSWORD_WRONG);
    }

    // Explicitly doing a targeted update of ONLY safe fields. Password is NEVER updated here.
    const data = {
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      email: normalizedEmail,
      username,
      phone: phone === undefined ? undefined : phone ? String(phone).trim() : null,
      ...pinData(auth.user.shopId, parsedPin.pin),
      role: role !== undefined ? role : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
      // A role change or deactivation ends the user's open sessions.
      ...((role !== undefined && role !== targetUser.role) || (isActive === false && targetUser.isActive)
        ? { tokenVersion: { increment: 1 } }
        : {}),
    };

    // Demoting or deactivating an active admin must leave the shop another active admin.
    const losesAdmin =
      targetUser.role === 'ADMIN' && targetUser.isActive && ((role !== undefined && role !== 'ADMIN') || isActive === false);
    const updatedUser = losesAdmin
      ? await updateUserKeepingAnAdmin(auth.user.shopId, isActive === false ? 'deactivate' : 'demote', (tx) =>
          tx.user.update({ where: { id: userId }, data, select: USER_SELECT })
        )
      : await prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });

    // Log the action securely
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'UPDATE_USER',
        meta: JSON.stringify({
          targetEmail: updatedUser.email,
          targetUsername: updatedUser.username,
          targetRole: updatedUser.role,
          self: isSelf,
          pinChanged: parsedPin.pin !== undefined,
        })
      }
    });

    return NextResponse.json({ success: true, user: publicUser(updatedUser) });
  } catch (error) {
    const response = writeError(error);
    if (response) return response;
    console.error('Error updating user:', error);
    return fail('Internal server error', 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return fail('Unauthorized', 401);
    }

    if (auth.user.role !== 'ADMIN') {
      return fail('Forbidden: Admins only', 403);
    }

    // Self-delete protection
    if (userId === auth.user.id) {
      return fail("You can't delete your own account");
    }

    // Security: Fetch target user and ensure they belong to the same shop
    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        shopId: auth.user.shopId
      }
    });

    if (!targetUser) {
      return fail('User not found', 404);
    }

    // Role Escalation Guard: Prevent deleting another Admin
    if (targetUser.role === 'ADMIN') {
      return fail('Cannot delete another Admin account', 403);
    }

    // HARD DELETE PREVENTED: We do a Soft Delete instead so any previous invoices linked to this user don't break.
    // Last-admin check kept as a safety net in case the admin rules above change.
    await updateUserKeepingAnAdmin(auth.user.shopId, 'delete', (tx) =>
      tx.user.update({ where: { id: userId }, data: { isActive: false, tokenVersion: { increment: 1 } } })
    );

    // Log the DELETE (Deactivation) operation securely
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'DELETE_USER',
        meta: JSON.stringify({ targetEmail: targetUser.email, targetRole: targetUser.role })
      }
    });

    return NextResponse.json({ success: true, message: 'User successfully deactivated (soft deleted)' });
  } catch (error) {
    const response = writeError(error);
    if (response) return response;
    console.error('Error deleting user:', error);
    return fail('Internal server error', 500);
  }
}
