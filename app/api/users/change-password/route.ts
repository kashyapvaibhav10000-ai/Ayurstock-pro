import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, hashPassword } from '@/lib/auth';
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

    const { userId, newPassword } = await req.json();

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

    const hashed = hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashed }
    });

    // Log the action
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'UPDATE_PASSWORD',
        meta: JSON.stringify({ targetEmail: targetUser.email, targetRole: targetUser.role })
      }
    });

    return NextResponse.json({ success: true, message: 'Password successfully updated' });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
