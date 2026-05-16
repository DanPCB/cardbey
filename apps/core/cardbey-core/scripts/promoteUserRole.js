/**
 * CLI to promote an existing user to a platform role (e.g. super_admin).
 * Role can only be set via this script or createAdmin; never from client.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/promoteUserRole.js --email <email> --role SUPER_ADMIN
 *   pnpm admin:promote -- --email admin@example.com --role SUPER_ADMIN
 *
 * Allowed roles: super_admin, admin (stored lowercase in DB).
 * No hardcoded emails; requires explicit --email and --role.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ALLOWED_ROLES = ['super_admin', 'admin'];

function parseArgv() {
  const args = process.argv.slice(2);
  let email = null;
  let role = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1].trim();
      i++;
    } else if (args[i] === '--role' && args[i + 1]) {
      role = args[i + 1].trim().toLowerCase();
      i++;
    }
  }
  return { email, role };
}

async function main() {
  const { email, role } = parseArgv();

  if (!email || !role) {
    console.error('Usage: node scripts/promoteUserRole.js --email <email> --role <ROLE>');
    console.error('Example: node scripts/promoteUserRole.js --email ops@example.com --role SUPER_ADMIN');
    console.error('Allowed roles:', ALLOWED_ROLES.join(', '));
    process.exit(1);
  }

  if (!ALLOWED_ROLES.includes(role)) {
    console.error('Invalid role. Allowed:', ALLOWED_ROLES.join(', '));
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    console.error('User not found:', normalizedEmail);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role,
      roles: JSON.stringify([role]),
    },
  });

  console.log('Updated:', user.email, '-> role:', role);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
