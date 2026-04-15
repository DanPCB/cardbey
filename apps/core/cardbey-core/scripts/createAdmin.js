/**
 * One-time CLI to create or update a Platform Admin user.
 * Uses env: ADMIN_EMAIL, ADMIN_PASSWORD (required).
 * Run from repo root: pnpm create:admin (from apps/core/cardbey-core)
 * Do NOT hardcode credentials; use env vars only.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Missing env: ADMIN_EMAIL and ADMIN_PASSWORD are required.');
    console.error('Example: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret pnpm create:admin');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = email.toLowerCase().trim();
  const baseHandle = (normalizedEmail.split('@')[0] || 'admin').replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'admin';
  const handle = `admin-${baseHandle}-${Date.now()}`;

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'admin',
        roles: '["admin"]',
      },
    });
    console.log('Admin updated:', normalizedEmail);
  } else {
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: 'Platform Admin',
        handle,
        role: 'admin',
        roles: '["admin"]',
        hasBusiness: false,
        onboarding: JSON.stringify({
          completed: true,
          currentStep: 'done',
          steps: { welcome: true, profile: true, business: true },
        }),
      },
    });
    console.log('Admin created:', normalizedEmail);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
