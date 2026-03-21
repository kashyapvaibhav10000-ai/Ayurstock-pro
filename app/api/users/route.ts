import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
    }

    // STRICT SHOP ISOLATION & NO PASSWORD HASHES RETURNED
    const users = await prisma.user.findMany({
      where: {
        shopId: auth.user.shopId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ success: true, currentUserId: auth.user.id, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, message: 'Forbidden: Admins only' }, { status: 403 });
    }

    const { name, email, password, role } = await req.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check if email already exists in this shop
    const existingUser = await prisma.user.findFirst({
      where: {
        shopId: auth.user.shopId,
        email: email.toLowerCase().trim()
      }
    });

    if (existingUser) {
      return NextResponse.json({ success: false, message: 'User with this email already exists' }, { status: 400 });
    }

    // Security: Only allow specific roles
    const validRoles = ['ADMIN', 'MANAGER', 'CASHIER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role provided' }, { status: 400 });
    }

    // Hash the password SECURELY using the library's bcrypt implementation
    const hashed = hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        shopId: auth.user.shopId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash: hashed,
        role: role,
        isActive: true, // Default to true when created
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

    // Log the creation action securely
    await prisma.activityLog.create({
      data: {
        shopId: auth.user.shopId,
        userId: auth.user.id,
        action: 'CREATE_USER',
        meta: JSON.stringify({ targetEmail: newUser.email, targetRole: newUser.role })
      }
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
