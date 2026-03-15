import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';

async function main() {
  console.log('🌱 Seeding database...');

  const shop = await prisma.shop.upsert({
    where: { gstin: '' },
    update: {},
    create: {
      name: 'AyurStock Pro',
      gstin: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  console.log('✓ Created shop:', shop.name);

  const passwordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: {
      shopId_email: {
        shopId: shop.id,
        email: 'admin@demo.com',
      },
    },
    update: {},
    create: {
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
