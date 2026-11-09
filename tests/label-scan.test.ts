/**
 * Add Inventory camera label scan: reply parsing/validation and the
 * /api/inventory/scan-label route (auth, role, size/type limits, AI chain
 * reuse). The AI call itself is mocked; no network.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const vision = vi.hoisted(() => ({ reply: null as null | { content: string; provider: string }, calls: [] as unknown[][] }));
vi.mock('@/lib/aiParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/aiParser')>();
  return {
    ...actual,
    runVisionPrompt: vi.fn(async (...args: unknown[]) => {
      vision.calls.push(args);
      const accept = args[4] as (content: string) => boolean;
      return vision.reply && accept(vision.reply.content) ? vision.reply : null;
    }),
  };
});

import { resetDb, seedShop, tokenFor, Seed } from './helpers';
import { parseLabelScan, LABEL_SCAN_MAX_BYTES } from '@/lib/label-scan';
import * as scanLabel from '@/app/api/inventory/scan-label/route';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);

describe('parseLabelScan', () => {
  it('strips ```json fences and keeps valid fields', () => {
    const r = parseLabelScan('```json\n{"medicine_name":" Ashwagandha  Churna ","company":"Dabur","batch":"ab 1234","expiry_month":7,"expiry_year":27,"mrp":"₹ 145.50","packing":"100 gm","confidence":0.82}\n```');
    expect(r).toEqual({
      medicine_name: 'Ashwagandha Churna', company: 'Dabur', batch: 'AB1234',
      expiry_month: 7, expiry_year: 2027, mrp: 145.5, packing: '100 gm', confidence: 0.82,
    });
  });

  it('nulls wrong types and out-of-range values; month needs a year', () => {
    const r = parseLabelScan('{"medicine_name":123,"batch":"N/A","expiry_month":13,"expiry_year":2027,"mrp":-5,"packing":null,"confidence":250,"company":"X"}');
    expect(r).toBeNull(); // nothing usable was read
    const s = parseLabelScan('{"medicine_name":"Liv 52","expiry_month":5,"expiry_year":null,"mrp":"abc","confidence":85}');
    expect(s).toMatchObject({ medicine_name: 'Liv 52', expiry_month: null, expiry_year: null, mrp: null, confidence: 0.85 });
  });

  it('rejects non-JSON and arrays', () => {
    expect(parseLabelScan('I could not read the label.')).toBeNull();
    expect(parseLabelScan('[{"medicine_name":"x"}]')).toBeNull();
  });
});

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
  vision.reply = null;
  vision.calls = [];
});

function scanReq(user: Seed['admin'] | null, body?: Buffer, type = 'image/jpeg') {
  const fd = new FormData();
  if (body) fd.set('image', new Blob([new Uint8Array(body)], { type }), 'label.jpg');
  const headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.7' };
  if (user) headers.cookie = `auth-token=${tokenFor(user)}`;
  return new NextRequest(new URL('/api/inventory/scan-label', 'http://localhost:3000'), { method: 'POST', body: fd, headers });
}

describe('POST /api/inventory/scan-label', () => {
  it('needs a session and ADMIN/MANAGER', async () => {
    expect((await scanLabel.POST(scanReq(null, JPEG))).status).toBe(401);
    expect((await scanLabel.POST(scanReq(A.cashier, JPEG))).status).toBe(403);
    expect(vision.calls.length).toBe(0);
  });

  it('refuses photos over 2 MB and non-images, without calling AI', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(LABEL_SCAN_MAX_BYTES)]);
    expect((await scanLabel.POST(scanReq(A.manager, big))).status).toBe(413);
    const pdf = Buffer.from('%PDF-1.4 not an image');
    expect((await scanLabel.POST(scanReq(A.manager, pdf, 'image/jpeg'))).status).toBe(400);
    expect((await scanLabel.POST(scanReq(A.manager))).status).toBe(400);
    expect(vision.calls.length).toBe(0);
  });

  it('returns the validated fields, via the shared vision chain tagged LABEL_SCAN for the shop', async () => {
    vision.reply = { content: '```json\n{"medicine_name":"Liv 52","company":"Himalaya","batch":"b77","expiry_month":3,"expiry_year":2028,"mrp":210,"packing":"100 Tab","confidence":0.9}\n```', provider: 'gemini' };
    const res = await scanLabel.POST(scanReq(A.manager, JPEG));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ medicine_name: 'Liv 52', batch: 'B77', expiry_month: 3, expiry_year: 2028, mrp: 210 });
    const [, mime, , ctx] = vision.calls[0] as [Buffer, string, string, { feature: string; shopId: string }];
    expect(mime).toBe('image/jpeg');
    expect(ctx).toEqual({ feature: 'LABEL_SCAN', shopId: A.shop.id });
  });

  it('unreadable reply → 422 with a clean message', async () => {
    vision.reply = { content: 'sorry, too blurry', provider: 'gemini' };
    const res = await scanLabel.POST(scanReq(A.manager, JPEG));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("Couldn't read label, enter manually");
  });

  it('is rate limited per user (30 per 10 minutes)', async () => {
    vision.reply = { content: '{"medicine_name":"Liv 52"}', provider: 'gemini' };
    for (let i = 0; i < 30; i++) expect((await scanLabel.POST(scanReq(A.manager, JPEG))).status).toBe(200);
    expect((await scanLabel.POST(scanReq(A.manager, JPEG))).status).toBe(429);
    // Another user is unaffected.
    expect((await scanLabel.POST(scanReq(A.admin, JPEG))).status).toBe(200);
  }, 60_000);
});
