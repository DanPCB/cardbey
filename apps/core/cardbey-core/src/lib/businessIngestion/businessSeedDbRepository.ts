/**
 * Postgres-backed BusinessSeed persistence.
 */

import prisma from '../prisma.js';
import type { IngestedSeedRecord } from './types.js';
import { dbRowToIngestedSeed, ingestedSeedToDbRow } from './businessSeedMapper.js';

export async function dbListSeedRecords(): Promise<IngestedSeedRecord[]> {
  const rows = await prisma.businessSeed.findMany({
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(dbRowToIngestedSeed);
}

export async function dbGetSeedRecordById(id: string): Promise<IngestedSeedRecord | null> {
  const row = await prisma.businessSeed.findUnique({ where: { id } });
  return row ? dbRowToIngestedSeed(row) : null;
}

export async function dbUpsertSeedRecords(incoming: IngestedSeedRecord[]): Promise<IngestedSeedRecord[]> {
  for (const seed of incoming) {
    const data = ingestedSeedToDbRow(seed);
    await prisma.businessSeed.upsert({
      where: { id: seed.id },
      create: data,
      update: {
        source: data.source,
        status: data.status,
        name: data.name,
        website: data.website,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        rawPayload: data.rawPayload,
        dedupeKey: data.dedupeKey,
        storeId: data.storeId,
        completenessTier: data.completenessTier,
        completenessScore: data.completenessScore,
        completenessBlockers: data.completenessBlockers,
        completenessGaps: data.completenessGaps,
        completenessCheckedAt: data.completenessCheckedAt,
        updatedAt: data.updatedAt,
      },
    });
  }
  return incoming;
}

/** Full sync — records not in list are removed (matches seeds.json replace semantics). */
export async function dbSaveSeedRecords(records: IngestedSeedRecord[]): Promise<void> {
  const keepIds = new Set(records.map((r) => r.id));

  if (keepIds.size === 0) {
    await prisma.businessSeed.deleteMany({});
    return;
  }

  await prisma.businessSeed.deleteMany({
    where: { id: { notIn: [...keepIds] } },
  });

  for (const seed of records) {
    const data = ingestedSeedToDbRow(seed);
    await prisma.businessSeed.upsert({
      where: { id: seed.id },
      create: data,
      update: {
        source: data.source,
        status: data.status,
        name: data.name,
        website: data.website,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        rawPayload: data.rawPayload,
        dedupeKey: data.dedupeKey,
        storeId: data.storeId,
        completenessTier: data.completenessTier,
        completenessScore: data.completenessScore,
        completenessBlockers: data.completenessBlockers,
        completenessGaps: data.completenessGaps,
        completenessCheckedAt: data.completenessCheckedAt,
        updatedAt: data.updatedAt,
      },
    });
  }
}

export async function dbResetSeedRecordsForTests(): Promise<void> {
  await prisma.businessSeed.deleteMany({});
}

/** Backfill helper — skip when dedupeKey exists for a different id. */
export async function dbBackfillSeed(seed: IngestedSeedRecord): Promise<'inserted' | 'updated' | 'skipped'> {
  const data = ingestedSeedToDbRow(seed);
  const existingById = await prisma.businessSeed.findUnique({ where: { id: seed.id } });
  if (existingById) {
    await prisma.businessSeed.update({
      where: { id: seed.id },
      data: {
        source: data.source,
        status: data.status,
        name: data.name,
        website: data.website,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        rawPayload: data.rawPayload,
        dedupeKey: data.dedupeKey,
        storeId: data.storeId,
        completenessTier: data.completenessTier,
        completenessScore: data.completenessScore,
        completenessBlockers: data.completenessBlockers,
        completenessGaps: data.completenessGaps,
        completenessCheckedAt: data.completenessCheckedAt,
        updatedAt: data.updatedAt,
      },
    });
    return 'updated';
  }

  const existingByDedupe = await prisma.businessSeed.findUnique({
    where: { dedupeKey: data.dedupeKey },
  });
  if (existingByDedupe && existingByDedupe.id !== seed.id) {
    return 'skipped';
  }

  await prisma.businessSeed.create({ data });
  return 'inserted';
}
