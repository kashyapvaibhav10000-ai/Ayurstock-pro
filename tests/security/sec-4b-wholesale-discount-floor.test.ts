/**
 * Finding #4 follow-up: the wholesale/transfer cost floor checked the rate
 * before the line discount, so a discount inside the role's cap could still
 * take the price actually charged below cost. The floor now applies to the
 * effective unit price after each batch's share of the line discount.
 *
 * Seeded batch: MRP 100, selling 90, cost 60. Default discount caps:
 * cashier 10%, manager 25%.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as sales from '@/app/api/sales/route';

let A: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
});

const sell = (user: Seed['admin'], saleType: string, rate: number, discount: number, quantity = 1) =>
  call(
    sales.POST,
    makeReq('/api/sales', {
      method: 'POST',
      token: tokenFor(user),
      body: { saleType, paymentMode: 'CASH', items: [{ medicineId: A.medicine.id, quantity, rate, discount }] },
    })
  );

describe('#4 follow-up: discount cannot push a wholesale/transfer price below cost', () => {
  it('cashier WHOLESALE, rate 65 with the max 10% discount (58.50/unit) is refused', async () => {
    const res = await sell(A.cashier, 'WHOLESALE', 65, 6.5);
    expect(res.status).toBe(400);
    expect(res.json.error).not.toContain('60');
    expect(await prisma.sale.count({ where: { shopId: A.shop.id, saleType: 'WHOLESALE' } })).toBe(0);
  });

  it('manager WHOLESALE, rate 70 x2 with the max 25% discount (52.50/unit) is refused', async () => {
    const res = await sell(A.manager, 'WHOLESALE', 70, 35, 2);
    expect(res.status).toBe(400);
    expect(res.json.error).not.toContain('60');
  });

  it('manager TRANSFER, rate 75 with 25% discount (56.25/unit) is refused', async () => {
    expect((await sell(A.manager, 'TRANSFER', 75, 18.75)).status).toBe(400);
  });

  it('a discount that stays at or above cost is still allowed', async () => {
    expect((await sell(A.cashier, 'WHOLESALE', 90, 9)).status).toBe(201); // 81/unit
    expect((await sell(A.manager, 'WHOLESALE', 80, 20)).status).toBe(201); // exactly 60/unit
  });

  it('retail discounts are unchanged (cost floor does not apply)', async () => {
    expect((await sell(A.manager, 'RETAIL', 0, 22.5)).status).toBe(201); // 90 - 25% = 67.50 > cost, cap rules only
  });
});
