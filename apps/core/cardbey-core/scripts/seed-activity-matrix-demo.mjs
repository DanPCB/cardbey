#!/usr/bin/env node
/**
 * Dev-only seed: realistic StoreActivityEvent data for User Activity Matrix demos.
 * Usage (from apps/core/cardbey-core): node scripts/seed-activity-matrix-demo.mjs <storeId>
 *
 * Never run in production.
 */

import { getPrismaClient } from '../src/lib/prisma.js';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed activity matrix demo data in production.');
  process.exit(1);
}

const storeId = process.argv[2];
if (!storeId) {
  console.error('Usage: node scripts/seed-activity-matrix-demo.mjs <storeId>');
  process.exit(1);
}

const prisma = getPrismaClient();

const personas = [
  { key: 'daily', days: 14, gap: 1 },
  { key: 'weekly', days: 8, gap: 7 },
  { key: 'one_time', days: 1, gap: 1 },
  { key: 'dormant', days: 3, gap: 1, offsetDays: 40 },
  { key: 'reactivated', days: 2, gap: 20, offsetDays: 35 },
  { key: 'power', days: 20, gap: 1 },
  { key: 'new_user', days: 2, gap: 2 },
];

async function main() {
  const store = await prisma.business.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) {
    console.error('Store not found:', storeId);
    process.exit(1);
  }

  const now = Date.now();
  let created = 0;

  for (const persona of personas) {
    const sessionId = `demo-${persona.key}-${randomUUID().slice(0, 8)}`;
    let day = persona.offsetDays ?? 0;
    for (let i = 0; i < persona.days; i += 1) {
      const at = new Date(now - (day + i * persona.gap) * 86_400_000);
      await prisma.storeActivityEvent.create({
        data: {
          id: randomUUID(),
          storeId,
          sessionId,
          eventType: i % 3 === 0 ? 'OFFER_VIEWED' : 'STORE_VIEWED',
          source: 'seed_activity_matrix',
          metadataJson: { persona: persona.key },
          createdAt: at,
        },
      });
      created += 1;
    }
  }

  console.log(`Seeded ${created} StoreActivityEvent rows for store ${storeId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
