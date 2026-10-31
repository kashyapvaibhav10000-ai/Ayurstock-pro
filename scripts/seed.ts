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

  // Demo accounts. Log in with the username or the email.
  const demoUsers = [
    { username: 'admin', name: 'Admin', email: 'admin@demo.com', password: 'admin123', role: 'ADMIN' },
    { username: 'manager', name: 'Manager', email: 'manager@demo.com', password: 'manager123', role: 'MANAGER' },
    { username: 'cashier', name: 'Cashier', email: 'cashier@demo.com', password: 'cashier123', role: 'CASHIER' },
  ];

  for (const demo of demoUsers) {
    // Usernames are global: only claim one that nobody else holds.
    const holder = await prisma.user.findUnique({ where: { username: demo.username }, select: { email: true, shopId: true } });
    const username = !holder || (holder.shopId === shop.id && holder.email === demo.email) ? demo.username : null;

    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: username ? { username } : {},
      create: {
        shopId: shop.id,
        name: demo.name,
        email: demo.email,
        username,
        passwordHash: await bcrypt.hash(demo.password, 10),
        role: demo.role,
        isActive: true,
      },
    });

    console.log(`✓ ${demo.role} user: ${user.email}${user.username ? ` (username: ${user.username})` : ' (username taken elsewhere, not set)'}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
