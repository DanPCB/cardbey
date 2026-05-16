/**
 * Get user login details by storeId
 * Run with: node scripts/get-user-by-store.js <storeId>
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function getUserByStore(storeId) {
  console.log(`🔍 Looking up user for storeId: ${storeId}\n`);

  // Find business by storeId
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    include: { user: true },
  });

  if (!business) {
    console.log(`❌ No business found with storeId: ${storeId}\n`);
    
    // Try to find by tenantId if provided
    const args = process.argv.slice(2);
    const tenantId = args.find(arg => arg.startsWith('tenantId='))?.split('=')[1];
    
    if (tenantId) {
      console.log(`🔍 Trying to find user by tenantId: ${tenantId}\n`);
      const user = await prisma.user.findUnique({
        where: { id: tenantId },
        include: { business: true },
      });
      
      if (user) {
        console.log('✅ Found user by tenantId:\n');
        printUserInfo(user);
        await prisma.$disconnect();
        return;
      }
    }
    
    await prisma.$disconnect();
    return;
  }

  if (!business.user) {
    console.log(`❌ Business found but no user associated.\n`);
    console.log('Business details:');
    console.log(JSON.stringify(business, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log('✅ Found user associated with this store:\n');
  printUserInfo(business.user, business);

  await prisma.$disconnect();
}

function printUserInfo(user, business = null) {
  console.log('📧 Login Details:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Display Name: ${user.displayName || 'N/A'}`);
  console.log(`   Handle: ${user.handle || 'N/A'}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   Role: ${user.role || 'N/A'}`);
  
  if (business) {
    console.log(`\n🏪 Store Details:`);
    console.log(`   Store ID: ${business.id}`);
    console.log(`   Store Name: ${business.name}`);
    console.log(`   Store Slug: ${business.slug}`);
  }
  
  console.log(`\n⚠️  Password: Cannot retrieve (hashed in database)`);
  console.log(`\n💡 Options:`);
  console.log(`   1. Use dev token: Authorization: Bearer dev-admin-token`);
  console.log(`   2. Reset password via API (if implemented)`);
  console.log(`   3. Create a new password (run with --reset-password flag)`);
  
  const args = process.argv.slice(2);
  if (args.includes('--reset-password')) {
    resetPassword(user);
  }
}

async function resetPassword(user) {
  console.log(`\n🔐 Resetting password for ${user.email}...\n`);
  
  try {
    const newPassword = 'Cardbey123!';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });
    
    console.log('✅ Password reset successfully!\n');
    console.log('📧 New Login Details:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n💡 You can now log in with these credentials.\n`);
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    throw error;
  }
}

// Main execution
const storeId = process.argv[2];
if (!storeId) {
  console.log('❌ Usage: node scripts/get-user-by-store.js <storeId> [--reset-password]');
  console.log('   Example: node scripts/get-user-by-store.js cmizw1i14000ajvk8af4sul5h');
  console.log('   Example: node scripts/get-user-by-store.js cmizw1i14000ajvk8af4sul5h --reset-password');
  process.exit(1);
}

getUserByStore(storeId).catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

