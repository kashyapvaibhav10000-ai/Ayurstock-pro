import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { staffOnlyResponse } from '@/middleware/auth';

async function guard(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.authenticated || !auth.user) {
    return { err: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const notStaff = staffOnlyResponse(auth.user.role);
  if (notStaff) return { err: notStaff };
  return { user: auth.user };
}

async function readBody(req: NextRequest) {
  try { return await req.json(); } catch { return {}; }
}

function dbError(error: any, fallback: string) {
  if (error?.code === 'P2002')
    return NextResponse.json({ success: false, message: 'Company already exists' }, { status: 409 });
  if (error?.code === 'P2003')
    return NextResponse.json({ success: false, message: 'Company in use, cannot delete' }, { status: 409 });
  if (error?.code === 'P2025')
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  console.error(fallback, error);
  return NextResponse.json({ success: false, message: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const g = await guard(req); if (g.err) return g.err;
  try {
    const companies = await prisma.company.findMany({
      where: { shopId: g.user!.shopId },
      select: { id: true, name: true, description: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ success: true, data: companies });
  } catch (e) { return dbError(e, 'Failed to fetch companies'); }
}

export async function POST(req: NextRequest) {
  const g = await guard(req); if (g.err) return g.err;
  const body = await readBody(req);
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ success: false, message: 'Name required' }, { status: 400 });
  try {
    const company = await prisma.company.create({
      data: { name, description: body.description?.trim() || null, shopId: g.user!.shopId },
    });
    return NextResponse.json({ success: true, data: company }, { status: 201 });
  } catch (e) { return dbError(e, 'Failed to save company'); }
}

export async function PUT(req: NextRequest) {
  const g = await guard(req); if (g.err) return g.err;
  const body = await readBody(req);
  const id = body.id ?? req.nextUrl.searchParams.get('id');
  const name = String(body.name ?? '').trim();
  if (!id || !name) return NextResponse.json({ success: false, message: 'id and name required' }, { status: 400 });
  try {
    const res = await prisma.company.updateMany({
      where: { id, shopId: g.user!.shopId },
      data: { name, description: body.description?.trim() || null },
    });
    if (res.count === 0) return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return dbError(e, 'Failed to update company'); }
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req); if (g.err) return g.err;
  const body = await readBody(req);
  const id = req.nextUrl.searchParams.get('id') ?? body.id;
  if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 });
  try {
    const res = await prisma.company.deleteMany({ where: { id, shopId: g.user!.shopId } });
    if (res.count === 0) return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return dbError(e, 'Failed to delete company'); }
}
