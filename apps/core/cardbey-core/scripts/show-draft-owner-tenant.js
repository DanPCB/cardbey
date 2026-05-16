/**
 * One-off: print ownerUserId and input.tenantId for recent DraftStore rows.
 * Run from apps/core/cardbey-core: node --experimental-require-module scripts/show-draft-owner-tenant.js
 * Or: npx tsx scripts/show-draft-owner-tenant.js
 */
import '../src/env/ensureDatabaseUrl.js';
import { getPrismaClient } from '../src/db/prisma.js';

const prisma = getPrismaClient();

const rows = await prisma.draftStore.findMany({
  take: 10,
  orderBy: { updatedAt: 'desc' },
  select: { id: true, ownerUserId: true, input: true, updatedAt: true, mode: true },
});

console.log('DraftStore rows (most recent 10):\n');
if (rows.length === 0) {
  console.log('(no drafts found)');
} else {
  for (const d of rows) {
    const input = d.input && typeof d.input === 'object' ? d.input : {};
    const tenantId = input.tenantId ?? '(missing)';
    console.log(`id: ${d.id}`);
    console.log(`  ownerUserId = ${d.ownerUserId ?? '(null)'}`);
    console.log(`  input.tenantId = ${tenantId}`);
    console.log(`  mode: ${d.mode ?? '-'}, updatedAt: ${d.updatedAt?.toISOString?.() ?? d.updatedAt}`);
    console.log('');
  }
}
await prisma.$disconnect();
