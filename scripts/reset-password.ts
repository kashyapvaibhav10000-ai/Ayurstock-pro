/**
 * Reset one user's password and end their existing sessions.
 *
 *   RESET_EMAIL=user@example.com RESET_PASSWORD='new password' \
 *     npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/reset-password.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { BCRYPT_COST, MIN_PASSWORD_LENGTH } from '../lib/password-policy';

const USAGE = `Usage: RESET_EMAIL=<email> RESET_PASSWORD=<new password, at least ${MIN_PASSWORD_LENGTH} characters> npx ts-node ... scripts/reset-password.ts`;

async function main() {
  const email = process.env.RESET_EMAIL?.trim().toLowerCase();
  const newPassword = process.env.RESET_PASSWORD;
  if (!email || !newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  const user = await prisma.user.updateMany({
    where: { email },
    data: {
      passwordHash,
      isActive: true,
      tokenVersion: { increment: 1 },
    },
  });

  if (user.count > 0) {
    console.log('Password reset successfully');
  } else {
    console.log('User not found');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
