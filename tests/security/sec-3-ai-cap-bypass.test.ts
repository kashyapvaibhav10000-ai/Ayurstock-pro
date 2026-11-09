/**
 * Finding #3 (Medium): the per-shop AI daily cap counted one AiCallLog row per
 * provider tier, while the text sent to that tier was uncapped. One request
 * with megabytes of text became thousands of provider calls. Now: text is
 * capped at MAX_AI_TEXT_CHARS (routes refuse more with 400), and every chunk
 * sent to a provider writes its own AiCallLog row.
 *
 * No network: openAiChat is mocked and counts the chunks it receives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: string[] = [];
vi.mock('@/lib/ai/providers/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers/http')>();
  return {
    ...actual,
    openAiChat: vi.fn(async ({ prompt }: { prompt: { user: string } }) => {
      sent.push(prompt.user);
      return JSON.stringify([{ name: 'Paracetamol 500', batchNo: 'B1', quantity: 10, mrp: 25 }]);
    }),
  };
});

import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import { parseTextWithAI } from '@/lib/aiParser';
import * as priceList from '@/app/api/medicine/import-price-list/route';
import * as medicineImport from '@/app/api/medicines/import/route';
import * as importBatch from '@/app/api/medicines/import/batch/route';
import * as importBatchJob from '@/app/api/medicines/import/batch/[id]/route';

const CAP = 200_000;
const line = 'Paracetamol 500mg tablets batch B123 qty 10 mrp 25.00 exp 12/27';
const textOf = (chars: number) => Array.from({ length: Math.ceil(chars / (line.length + 1)) }, () => line).join('\n');

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
  sent.length = 0;
  process.env.CEREBRAS_API_KEY = 'test-cerebras-key';
  // Chunks are spaced 1s apart; let fake time run fast.
  vi.useFakeTimers({ toFake: ['setTimeout'], shouldAdvanceTime: true, advanceTimeDelta: 1000 });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CEREBRAS_API_KEY;
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const formReq = (path: string, fd: FormData) =>
  new (require('next/server').NextRequest)(new URL(path, 'http://localhost:3000'), {
    method: 'POST',
    body: fd,
    headers: { cookie: `auth-token=${tokenFor(A.manager)}`, 'cf-connecting-ip': '203.0.113.9' },
  });

describe('#3 AI text is capped and every chunk is counted', () => {
  it('parseTextWithAI sends at most MAX_AI_TEXT_CHARS to providers', async () => {
    await parseTextWithAI(textOf(1_000_000), { feature: 'INVOICE_IMPORT', shopId: A.shop.id });
    const total = sent.reduce((n, s) => n + s.length, 0);
    // prompt wrapper + chunk overlap add a little per call
    expect(total).toBeLessThan(CAP * 1.3);
  }, 120_000);

  it('logs one AiCallLog row per chunk sent', async () => {
    await parseTextWithAI(textOf(12_000), { feature: 'INVOICE_IMPORT', shopId: A.shop.id });
    expect(sent.length).toBeGreaterThan(1);
    expect(await prisma.aiCallLog.count({ where: { shopId: A.shop.id } })).toBe(sent.length);
  }, 60_000);
});

describe('#3 import routes refuse over-cap text with 400', () => {
  it('import-price-list', async () => {
    const res = await call(priceList.POST, formReq('/api/medicine/import-price-list', form({ extractedText: textOf(CAP + 1000) })));
    expect(res.status).toBe(400);
    expect(res.json.errorCode).toBe('TEXT_TOO_LONG');
    expect(sent.length).toBe(0);
  });

  it('medicines/import', async () => {
    const res = await call(medicineImport.POST, formReq('/api/medicines/import', form({ extractedText: textOf(CAP + 1000) })));
    expect(res.status).toBe(400);
    expect(await prisma.importJob.count({ where: { shopId: A.shop.id } })).toBe(0);
  });

  it('medicines/import/batch POST refuses an oversized pdfText', async () => {
    const res = await call(
      importBatch.POST,
      makeReq('/api/medicines/import/batch', { method: 'POST', token: tokenFor(A.manager), body: { fileName: 'x.pdf', pdfText: textOf(CAP + 1000) } })
    );
    expect(res.status).toBe(400);
    expect(await prisma.pdfImportJob.count({ where: { shopId: A.shop.id } })).toBe(0);
  });

  it('medicines/import/batch/[id] PATCH refuses a stored oversized pdfText', async () => {
    const job = await prisma.pdfImportJob.create({
      data: { shopId: A.shop.id, userId: A.manager.id, fileName: 'old.pdf', pdfText: textOf(CAP + 1000), status: 'pending' },
    });
    const res = await call(
      importBatchJob.PATCH,
      makeReq(`/api/medicines/import/batch/${job.id}`, { method: 'PATCH', token: tokenFor(A.manager) }),
      { id: job.id }
    );
    expect(res.status).toBe(400);
    expect(sent.length).toBe(0);
  });
});
