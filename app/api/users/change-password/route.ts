import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, generateToken, hashPassword, setAuthCookie, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { userId, newPassword, currentPassword, confirmPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Security: Fetch target user and ensure they belong to the same shop
    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        shopId: auth.user.shopId
      }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    // Your own password: prove you know the current one (an open session alone is not enough).
    const isSelf = targetUser.id === auth.user.id;
    if (isSelf) {
      if (!currentPassword) {
        return NextResponse.json({ success: false, message: 'Enter your current password.' }, { status: 400 });
      }
      if (!(await verifyPassword(currentPassword, targetUser.passwordHash))) {
        return NextResponse.json({ success: false, message: 'Current password is incorrect.' }, { status: 400 });
      }
    }
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return NextResponse.json({ success: false, message: 'New password and confirmation do not match.' }, { status: 400 });
    }

    const hashed = await hashPassword(newPassword);

    const updated = await prisma.user.update({
      where: { id: userId },
      // Ends every session issued with the old password.
      data: { passwordHash: hashed, tokenVersion: { increment: 1 } }
    });

    // Log the action
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'UPDATE_PASSWORD',
        meta: JSON.stringify({ targetEmail: targetUser.email, targetRole: targetUser.role, self: isSelf })
      }
    });

    const response = NextResponse.json({ success: true, message: 'Password successfully updated' });
    if (isSelf) {
      // Keep the admin's own session: re-issue it with the new token version.
      const token = generateToken({ userId: auth.user.id, shopId: auth.user.shopId, email: auth.user.email, role: auth.user.role, tv: updated.tokenVersion });
      setAuthCookie(response, token);
    }
    return response;
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
