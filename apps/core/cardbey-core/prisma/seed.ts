import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@cardbey.com';
const ADMIN_PASSWORD = 'Admin123!';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      displayName: 'Admin User',
      role: 'super_admin',
      roles: JSON.stringify(['admin', 'super_admin']),
      emailVerified: true,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: 'Admin User',
      role: 'super_admin',
      roles: JSON.stringify(['admin', 'super_admin']),
      emailVerified: true,
      hasBusiness: false,
    },
  });

  console.log('Admin created:', admin.email);
  console.log('Password:', ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
