/**
 * Seed default users for development
 * 
 * Run with: node prisma/seed.users.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUsers() {
  console.log('🌱 Seeding users...');

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin' }
  });

  if (existingAdmin) {
    console.log('✅ Admin user already exists');
    return;
  }

  // Hash the demo password
  const hashedPassword = await bcrypt.hash('SuperSecret123!', 10);

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin',
      passwordHash: hashedPassword,
      displayName: 'Admin User',
      roles: JSON.stringify(['admin', 'viewer']),
      hasBusiness: false,
      onboarding: JSON.stringify({
        completed: true,
        currentStep: 'complete',
        steps: {
          welcome: true,
          profile: true,
          business: true
        }
      })
    }
  });

  console.log('✅ Created admin user:');
  console.log('   Email: admin');
  console.log('   Password: SuperSecret123!');
  console.log('   ID:', admin.id);
}

async function main() {
  try {
    await seedUsers();
    console.log('\n✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();




