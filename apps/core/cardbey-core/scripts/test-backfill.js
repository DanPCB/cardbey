console.log('Test script starting...');

import { PrismaClient } from '@prisma/client';

console.log('Prisma imported');

const prisma = new PrismaClient();

console.log('Prisma client created');

async function test() {
  console.log('Test function called');
  const count = await prisma.signageAsset.count();
  console.log(`Found ${count} SignageAssets`);
  await prisma.$disconnect();
  console.log('Test complete');
}

test().catch(console.error);
