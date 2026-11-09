import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { resetRateLimits } from '@/lib/rate-limit';
import { UserRole } from '@/types';

export { prisma };

/** Empty every table (keeps the migration history). */
export async function resetDb() {
  await resetRateLimits();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  }
}

const PASSWORD_HASH = bcrypt.hashSync('Password123!', 4);
export const PASSWORD = 'Password123!';

let seq = 0;

/**
 * A shop with one user per role, a supplier, a customer, a medicine with one
 * batch (MRP 100, selling 90, cost 60, 18% GST, 50 in stock), a completed
 * sale of 2 units and a purchase document.
 */
export async function seedShop(label: string) {
  const n = ++seq;
  const shop = await prisma.shop.create({
    data: { name: `Shop ${label}`, gstin: `GSTIN${label}${n}`, address: 'Addr', phone: '9999999999', email: `${label}${n}@shop.test` },
  });
  const mkUser = (role: UserRole) =>
    prisma.user.create({
      data: {
        shopId: shop.id,
        name: `${label} ${role}`,
        email: `${label.toLowerCase()}${n}-${role.toLowerCase()}@test.dev`,
        passwordHash: PASSWORD_HASH,
        role,
        isActive: true,
      },
    });
  const admin = await mkUser('ADMIN');
  const manager = await mkUser('MANAGER');
  const cashier = await mkUser('CASHIER');

  const supplier = await prisma.supplier.create({
    data: { shopId: shop.id, name: `Supplier ${label}`, phone: '9876543210', email: '', address: 'Somewhere 1' },
  });
  const customer = await prisma.customer.create({
    data: { shopId: shop.id, name: `Customer ${label}`, phone: `90000000${n}`, address: 'Street 1' },
  });
  const medicine = await prisma.medicine.create({
    data: { shopId: shop.id, name: `Med ${label}`, company: 'Co', category: 'General', hsn: '3004', gstPercent: 18 },
  });
  const batch = await prisma.inventoryBatch.create({
    data: {
      shopId: shop.id,
      medicineId: medicine.id,
      batchNumber: `B${label}`,
      expiryDate: new Date(Date.UTC(new Date().getUTCFullYear() + 2, 0, 31)),
      stockQty: 50,
      mrp: 100,
      sellingRate: 90,
      purchaseRate: 60,
    },
  });
  const sale = await prisma.sale.create({
    data: {
      shopId: shop.id,
      customerId: customer.id,
      invoiceNumber: `INV-${label}-1`,
      subtotal: 180,
      gstTotal: 27.46,
      grandTotal: 180,
      paymentMode: 'CREDIT',
      creditDue: 180,
      createdByUserId: admin.id,
      saleItems: {
        create: [{ medicineId: medicine.id, batchId: batch.id, quantity: 2, mrp: 100, rate: 90, gst: 27.46, gstPercent: 18, amount: 180 }],
      },
    },
    include: { saleItems: true },
  });
  const document = await prisma.purchaseDocument.create({
    data: { shopId: shop.id, fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 4, data: Buffer.from('%PDF') },
  });
  const rack = await prisma.rackLocation.create({ data: { shopId: shop.id, name: `R-${label}` } });

  return { shop, admin, manager, cashier, supplier, customer, medicine, batch, sale, saleItem: sale.saleItems[0], document, rack };
}

export type Seed = Awaited<ReturnType<typeof seedShop>>;

export function tokenFor(user: { id: string; shopId: string; email: string; role: string; tokenVersion?: number }) {
  return generateToken({ userId: user.id, shopId: user.shopId, email: user.email, role: user.role as UserRole, tv: user.tokenVersion ?? 0 });
}

type ReqOpts = {
  method?: string;
  body?: unknown;
  token?: string;
  ip?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
};

export function makeReq(path: string, opts: ReqOpts = {}) {
  const headers = new Headers(opts.headers);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  headers.set('cf-connecting-ip', opts.ip ?? '203.0.113.1');
  const cookies = { ...(opts.cookies || {}), ...(opts.token ? { 'auth-token': opts.token } : {}) };
  if (Object.keys(cookies).length) {
    headers.set('cookie', Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '));
  }
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Call a route handler; returns status and parsed JSON (or text). */
export async function call(handler: unknown, req: NextRequest, params: Record<string, string> = {}) {
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, res };
}

/** Value of a Set-Cookie header for `name`, or null. */
export function setCookie(res: Response, name: string): string | null {
  const all = res.headers.getSetCookie?.() ?? [];
  for (const line of all) {
    const [pair] = line.split(';');
    const [k, ...v] = pair.split('=');
    if (k.trim() === name) return v.join('=');
  }
  return null;
}
