/**
 * Finding #12 (Low): POST /api/returns stored any companyId it was given,
 * including another shop's company. Only a company of the caller's shop is
 * kept now; anything else becomes null.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { call, makeReq, prisma, resetDb, seedShop, tokenFor, Seed } from '../helpers';
import * as returns from '@/app/api/returns/route';

let A: Seed;
let B: Seed;

beforeEach(async () => {
  await resetDb();
  A = await seedShop('A');
  B = await seedShop('B');
});

const customerReturn = (companyId: string) =>
  call(
    returns.POST,
    makeReq('/api/returns', {
      method: 'POST',
      token: tokenFor(A.manager),
      body: { type: 'CUSTOMER', saleItemId: A.saleItem.id, quantity: 1, reason: 'Damaged', companyId },
    })
  );

describe('#12 return companyId must belong to the shop', () => {
  it("drops another shop's company id", async () => {
    const foreign = await prisma.company.create({ data: { shopId: B.shop.id, name: 'B Pharma' } });
    const res = await customerReturn(foreign.id);
    expect(res.status).toBe(200);
    const row = await prisma.medicineReturn.findUniqueOrThrow({ where: { id: res.json.data.id } });
    expect(row.companyId).toBeNull();
  });

  it("keeps the shop's own company id", async () => {
    const own = await prisma.company.create({ data: { shopId: A.shop.id, name: 'A Pharma' } });
    const res = await customerReturn(own.id);
    expect(res.status).toBe(200);
    const row = await prisma.medicineReturn.findUniqueOrThrow({ where: { id: res.json.data.id } });
    expect(row.companyId).toBe(own.id);
  });
});
