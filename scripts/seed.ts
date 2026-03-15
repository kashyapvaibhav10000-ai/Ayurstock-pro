import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';

async function main() {
  console.log('🌱 Seeding database...');

  const shop = await prisma.shop.create({
    data: {
      name: 'AyurStock Pro',
      gstin: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  console.log('✓ Created shop:', shop.name);

  const passwordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.create({
    data: {
      shopId: shop.id,
      name: 'Admin',
      email: 'admin@demo.com',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✓ Created admin user:', adminUser.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
