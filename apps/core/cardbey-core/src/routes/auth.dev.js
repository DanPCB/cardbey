import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.post('/dev/seed-admin', async (req, res) => {
  if (process.env.ALLOW_DEV_SEED !== '1') {
    return res.status(403).json({ ok: false, error: 'disabled' });
  }

  const username = 'admin';
  const password = 'SuperSecret123!';
  const email = username.toLowerCase();

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      displayName: username,
      roles: JSON.stringify(['admin'])
    },
    create: {
      email,
      passwordHash,
      displayName: username,
      roles: JSON.stringify(['admin']),
      hasBusiness: false
    }
  });

  return res.json({ ok: true, username, password });
});

export default router;
