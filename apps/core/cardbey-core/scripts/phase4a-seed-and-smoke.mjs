/**
 * Phase 4A: ensure tables, seed French Café capability, smoke plan→execute→rollback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { seedFrenchCafeCapability } from '../src/services/capabilityEngine/seedFrenchCafeCapability.js';
import {
  planCapabilityApplication,
  executeCapabilityApplication,
  rollbackCapabilityInstallation,
} from '../src/services/capabilityEngine/planAndExecute.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

process.env.ENABLE_CAPABILITY_ENGINE_V1 = 'true';
process.env.ENABLE_CAPABILITY_APPLICATION_V1 = 'true';
process.env.ENABLE_CAPABILITY_LIBRARY_V1 = 'true';

const { ensureCapabilityTables } = await import('./ensure-capability-tables.mjs');
await ensureCapabilityTables();
await ensurePrismaConnection();

console.log('=== Seed French Café capability ===');
const seeded = await seedFrenchCafeCapability(prisma);
console.log({
  ok: seeded.ok,
  slug: seeded.capability?.slug,
  version: seeded.version?.versionLabel,
  assetCount: seeded.assetCount,
  error: seeded.error,
});

if (!seeded.ok) {
  process.exitCode = 1;
  await prisma.$disconnect();
  process.exit(1);
}

const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
const draft = await prisma.draftStore.create({
  data: {
    mode: 'template',
    status: 'draft',
    expiresAt,
    input: { businessType: 'cafe', prompt: 'phase4a smoke' },
    preview: { storeName: 'Smoke Café' },
    ownerUserId: null,
  },
});
console.log('=== Draft store', draft.id);

const plan = await planCapabilityApplication(prisma, {
  capabilityVersionId: seeded.version.id,
  targetType: 'DRAFT_STORE',
  targetId: draft.id,
  actorUserId: null,
  inputs: {
    businessName: 'Le Petit Smoke',
    serviceCategory: 'cafe',
    location: 'Sydney',
  },
  force: true,
  isAdmin: true,
});
console.log('=== Plan', {
  ok: plan.ok,
  installationId: plan.installationId,
  steps: plan.plan?.steps?.length,
  rollbackAvailable: plan.plan?.rollbackAvailable,
  error: plan.error,
});

if (!plan.ok) {
  process.exitCode = 1;
  await prisma.$disconnect();
  process.exit(1);
}

const exec = await executeCapabilityApplication(prisma, {
  installationId: plan.installationId,
  confirm: true,
  inputs: {
    businessName: 'Le Petit Smoke',
    serviceCategory: 'cafe',
    location: 'Sydney',
  },
  force: true,
  isAdmin: true,
});
console.log('=== Execute', {
  ok: exec.ok,
  status: exec.installation?.status,
  created: exec.created,
  error: exec.error,
});

const rb = await rollbackCapabilityInstallation(prisma, {
  installationId: plan.installationId,
  reason: 'smoke_rollback',
});
console.log('=== Rollback', { ok: rb.ok, partial: rb.partial, status: rb.installation?.status, errors: rb.errors });

const after = await prisma.draftStore.findUnique({ where: { id: draft.id } });
console.log('=== Draft after rollback', {
  status: after?.status,
  hasCapabilityTemplate: Boolean(after?.input?.capabilityTemplateApplied),
  previewName: after?.preview?.storeName,
});

await prisma.$disconnect();
console.log('=== Phase 4A smoke complete ===');
