/**
 * Finding #8 (Low): recording a credit payment read creditDue, computed the
 * new balance in JS and wrote it back. Two payments at the same moment both
 * read the old balance, so one was lost while both were logged. The
 * decrement is now one conditional UPDATE; a payment that no longer fits the
 * balance gets 409.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as credits from '@/app/api/credits/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A'); // seeded sale has creditDue 180
});

const pay = (amount?: number) =>
  call(credits.PATCH, makeReq('/api/credits', { method: 'PATCH', token: tokenFor(A.manager), body: { saleId: A.sale.id, amount } }));

const due = async () => Number((await prisma.sale.findUniqueOrThrow({ where: { id: A.sale.id } })).creditDue);

describe('#8 concurrent credit payments are not lost', () => {
  it('two parallel partial payments both apply', async () => {
    const results = await Promise.all([pay(30), pay(50)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    // The balance matches what was logged as paid: nothing lost.
    const logged = await prisma.activityLog.findMany({ where: { shopId: A.shop.id, action: 'CREDIT_PAYMENT' } });
    const paidTotal = logged.reduce((n, row) => n + JSON.parse(row.meta as string).paidAmount, 0);
    expect(paidTotal).toBe(80);
    expect(await due()).toBe(100);
  });

  it('two parallel payments that together exceed the balance: one applies, one gets 409', async () => {
    const results = await Promise.all([pay(100), pay(100)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await due()).toBe(80);
    expect(await prisma.activityLog.count({ where: { shopId: A.shop.id, action: 'CREDIT_PAYMENT' } })).toBe(1);
  });

  it('a full settlement still clears the balance', async () => {
    expect((await pay()).status).toBe(200);
    expect(await due()).toBe(0);
  });
});
