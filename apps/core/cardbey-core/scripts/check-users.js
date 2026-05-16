/**
 * Check existing users in the database
 * Run with: node scripts/check-users.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkUsers() {
  console.log('🔍 Checking users in database...\n');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      handle: true,
      displayName: true,
      role: true,
      hasBusiness: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (users.length === 0) {
    console.log('❌ No users found in database.\n');
    console.log('💡 To create a test user, you can:');
    console.log('   1. Register via API: POST /api/auth/register');
    console.log('   2. Use dev token: Authorization: Bearer dev-admin-token');
    console.log('   3. Run this script with --create flag\n');
    
    // Ask if user wants to create a test user
    const args = process.argv.slice(2);
    if (args.includes('--create')) {
      await createTestUser();
    } else {
      console.log('   Run with --create flag to create a test user:');
      console.log('   node scripts/check-users.js --create\n');
    }
  } else {
    console.log(`✅ Found ${users.length} user(s):\n`);
    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email}`);
      console.log(`      Display Name: ${user.displayName || 'N/A'}`);
      console.log(`      Handle: ${user.handle || 'N/A'}`);
      console.log(`      Role: ${user.role || 'N/A'}`);
      console.log(`      Has Business: ${user.hasBusiness ? 'Yes' : 'No'}`);
      console.log(`      Created: ${user.createdAt.toISOString()}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

async function createTestUser() {
  console.log('\n📝 Creating test user...\n');

  const email = 'test@cardbey.com';
  const password = 'test123';
  const displayName = 'Test User';

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log(`⚠️  User ${email} already exists.\n`);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashedPassword,
      displayName,
      roles: JSON.stringify(['viewer']),
      hasBusiness: false,
    },
  });

  console.log('✅ Test user created successfully!\n');
  console.log('   Email:', email);
  console.log('   Password:', password);
  console.log('   Display Name:', displayName);
  console.log('\n💡 You can now log in with these credentials.\n');
}

checkUsers().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

