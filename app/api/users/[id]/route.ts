import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { name, email, role, isActive } = await req.json();

    if (!userId) {
      return NextResponse.json({ success: false, message: 'User ID is required' }, { status: 400 });
    }

    // Security: Fetch target user and ensure they belong to the same shop!
    const targetUser = await prisma.user.findFirst({
      where: {
        id: userId,
        shopId: auth.user.shopId
      }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    // Role Escalation & Last Admin Guard: Prevent modifying another Admin
    if (targetUser.role === 'ADMIN') {
       if (auth.user.id !== targetUser.id) {
         return NextResponse.json({ success: false, message: 'Cannot demote or deactivate another Admin account' }, { status: 403 });
       }
       
       // If the admin is modifying THEMSELVES (demoting or deactivating)
       if (role !== 'ADMIN' || isActive === false) {
         const adminCount = await prisma.user.count({
           where: { shopId: auth.user.shopId, role: 'ADMIN', isActive: true }
         });
         
         if (adminCount <= 1) {
           return NextResponse.json({ success: false, message: 'Cannot demote or deactivate the last active Admin account in the shop' }, { status: 403 });
         }
       }
    }

    // Security: Ensure only valid roles are assigned
    const validRoles = ['ADMIN', 'MANAGER', 'CASHIER'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role provided' }, { status: 400 });
    }

    // Explicitly doing a targeted update of ONLY safe fields. Password is NEVER updated here.
    const updatedUser = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        name: name ? name.trim() : undefined,
        email: email ? email.toLowerCase().trim() : undefined,
        role: role !== undefined ? role : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });

    // Log the action securely
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'UPDATE_USER',
        meta: JSON.stringify({ targetEmail: updatedUser.email, targetRole: updatedUser.role })
      }
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
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
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
    }


    // Self-delete protection
    if (userId === auth.user.id) {
      return NextResponse.json({ success: false, message: 'You cannot delete your own account' }, { status: 400 });
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

    // Last Admin Safety Net: If the user IS an admin (we already blocked deleting OTHER admins, but let's be double sure it's not the LAST admin)
    if (targetUser.role === 'ADMIN') {
       const adminCount = await prisma.user.count({
           where: { shopId: auth.user.shopId, role: 'ADMIN', isActive: true }
       });
       if (adminCount <= 1) {
           return NextResponse.json({ success: false, message: 'Cannot delete the last active Admin account in the shop' }, { status: 403 });
       }
    }

    // Role Escalation Guard: Prevent deleting another Admin
    if (targetUser.role === 'ADMIN' && targetUser.id !== auth.user.id) {
      return NextResponse.json({ success: false, message: 'Cannot delete another Admin account' }, { status: 403 });
    }

    // HARD DELETE PREVENTED: We do a Soft Delete instead so any previous invoices linked to this user don't break
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        isActive: false
      }
    });

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
    console.error('Error deleting user:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
