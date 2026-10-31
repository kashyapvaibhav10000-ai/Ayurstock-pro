/**
 * One-time: move plaintext POS PINs (User.pin, now legacyPin) into pinHash
 * and clear the plaintext. Run once after the security_hardening migration,
 * with PIN_HASH_KEY set to the same value the app uses:
 *
 *   PIN_HASH_KEY=... npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/hash-pins.ts
 *
 * Safe to re-run. If two users of one shop share a PIN, the later one is
 * cleared and listed so an admin can set a new PIN for them.
 */
import { PrismaClient } from '@prisma/client';
import { hashPin } from '../lib/pin';

const prisma = new PrismaClient();

async function main() {
  if (!process.env.PIN_HASH_KEY || process.env.PIN_HASH_KEY.length < 32) {
    throw new Error('Set PIN_HASH_KEY (at least 32 characters) to the value the app uses.');
  }
  const users = await prisma.user.findMany({
    where: { legacyPin: { not: null } },
    select: { id: true, shopId: true, email: true, legacyPin: true },
    orderBy: { createdAt: 'asc' },
  });

  let converted = 0;
  const cleared: string[] = [];
  for (const user of users) {
    const pin = user.legacyPin!;
    if (!/^\d{4}$/.test(pin)) {
      await prisma.user.update({ where: { id: user.id }, data: { legacyPin: null } });
      cleared.push(`${user.email} (invalid PIN format)`);
      continue;
    }
    const pinHash = hashPin(user.shopId, pin);
    const clash = await prisma.user.findFirst({ where: { shopId: user.shopId, pinHash, NOT: { id: user.id } }, select: { id: true } });
    if (clash) {
      await prisma.user.update({ where: { id: user.id }, data: { legacyPin: null } });
      cleared.push(`${user.email} (PIN shared with another user of the shop)`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { pinHash, legacyPin: null } });
    converted++;
  }

  console.log(`Hashed ${converted} PIN(s).`);
  if (cleared.length) console.log(`Cleared, set a new PIN for:\n  ${cleared.join('\n  ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
