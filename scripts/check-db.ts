import { prisma } from '../lib/db';

async function check() {
  const meds = await prisma.medicine.findMany({
    where: { name: { contains: 'KAMPVATARI' } }
  });
  console.log('KAMPVATARI in DB:', meds);

  const meds2 = await prisma.medicine.findMany({
    where: { name: { contains: 'PRAVAL' } }
  });
  console.log('PRAVAL in DB:', meds2.map(m => m.name + ' | ' + m.packing + ' | ' + m.mrp));

  process.exit(0);
}

check();
