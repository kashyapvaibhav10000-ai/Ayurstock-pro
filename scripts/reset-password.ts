import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';

async function main() {
  const email = 'admin@demo.com';
  const newPassword = 'admin123';
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const user = await prisma.user.updateMany({
    where: { email },
    data: {
      passwordHash,
      isActive: true,
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
