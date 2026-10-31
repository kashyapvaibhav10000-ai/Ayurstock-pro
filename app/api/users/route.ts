import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { USERNAME_TAKEN, isUsernameConflict, parseUsernameInput } from '@/lib/username';

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
        username: true,
        phone: true,
        pinHash: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      currentUserId: auth.user.id,
      // The PIN hash never leaves the server.
      users: users.map(({ pinHash, ...user }) => ({ ...user, hasPin: Boolean(pinHash) })),
    });
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

    const { name, email, password, role, username: usernameInput } = await req.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Emails are unique across all shops (login has no shop selector).
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ success: false, message: 'This email is already in use' }, { status: 400 });
    }

    const parsedUsername = parseUsernameInput(usernameInput);
    if (!parsedUsername.ok) {
      return NextResponse.json({ success: false, message: parsedUsername.error }, { status: 400 });
    }
    const username = parsedUsername.username ?? null;
    if (username && (await prisma.user.findUnique({ where: { username }, select: { id: true } }))) {
      return NextResponse.json({ success: false, message: USERNAME_TAKEN }, { status: 400 });
    }

    // Security: Only allow specific roles
    const validRoles = ['ADMIN', 'MANAGER', 'CASHIER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role provided' }, { status: 400 });
    }

    // Hash the password SECURELY using the library's bcrypt implementation
    const hashed = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        shopId: auth.user.shopId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        username,
        passwordHash: hashed,
        role: role,
        isActive: true, // Default to true when created
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
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
        meta: JSON.stringify({ targetEmail: newUser.email, targetUsername: newUser.username, targetRole: newUser.role })
      }
    });

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error) {
    // Lost a race with another request for the same username.
    if (isUsernameConflict(error)) {
      return NextResponse.json({ success: false, message: USERNAME_TAKEN }, { status: 400 });
    }
    console.error('Error creating user:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
