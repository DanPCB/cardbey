/**
 * ExecutiveLead → business_seed promotion bridge.
 * Uses Discovery Engine V1 governed pipeline — no DraftStore/Business creation.
 */

import { getPrismaClient } from '../prisma.js';
import { businessQualityScorer } from '../businessIngestion/BusinessQualityScorer.js';
import { recordDiscoveryIngestionRun } from '../businessIngestion/BusinessIngestionRunRepository.js';
import { recordSeedLifecycleTransition } from '../businessIngestion/BusinessSeedStatusTransitionRepository.js';
import { listSeedRecords, upsertSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { toGovernedLifecycleStage } from '../businessIngestion/seedLifecycleGovernance.js';
import type { IngestedSeedRecord } from '../businessIngestion/types.js';
import {
  computeIdentityScore,
  type IdentityMatchInput,
} from '../discoveryEngine/dedupe/BusinessIdentityEngine.js';
import { discoveryPromotionPipeline } from '../discoveryEngine/pipelines/DiscoveryPromotionPipeline.js';
import { assertDiscoverySeedsGoverned } from '../discoveryEngine/governance/runtimeAuthority.js';
import {
  appendDiscoveryJob,
  createDiscoveryJob,
  updateDiscoveryJob,
} from '../discoveryEngine/jobs/DiscoveryJobRepository.js';
import type { BusinessCandidate } from '../discoveryEngine/types/index.js';
import { validateLeadInput, type LeadInput as ExecutiveLeadInput } from './growthCommandCenterService.js';

export type PromoteLeadToSeedResult =
  | {
      ok: true;
      seedId: string;
      status: 'seeded_pending_qa';
      message: string;
      discoveryJobId: string;
      seed: IngestedSeedRecord;
    }
  | {
      ok: false;
      error: string;
      message: string;
      duplicate?: boolean;
      existingSeedId?: string;
    };

function trim(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function leadToIdentityInput(lead: ExecutiveLeadInput): IdentityMatchInput {
  return {
    businessName: trim(lead.businessName),
    phone: trim(lead.phone),
    email: trim(lead.email),
    website: trim(lead.website),
    latitude: Number.isFinite(lead.lat) ? (lead.lat as number) : null,
    longitude: Number.isFinite(lead.lng) ? (lead.lng as number) : null,
  };
}

function leadToCandidate(lead: {
  id: string;
  businessName: string;
  ownerName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  address?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
}): BusinessCandidate {
  return {
    providerId: 'partner_import',
    externalId: lead.id,
    businessName: lead.businessName,
    category: lead.category,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    postcode: lead.postcode,
    country: lead.country,
    latitude: lead.lat ?? null,
    longitude: lead.lng ?? null,
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    socialProfiles: [],
    sourceUrl: `executive-lead:${lead.id}`,
    discoveredAt: new Date().toISOString(),
    confidence: 0.75,
    metadata: {
      executiveLeadId: lead.id,
      ownerName: lead.ownerName ?? null,
      suburb: lead.suburb ?? null,
      origin: 'growth_command_center',
    },
  };
}

const PIPELINE_STATUSES = new Set([
  'seeded_pending_qa',
  'seeded_claimable',
  'claim_pending',
  'verified_owner',
  'active',
]);

export async function findLeadPromotionDuplicate(
  lead: ExecutiveLeadInput,
): Promise<{ duplicate: boolean; existingSeedId?: string; message?: string }> {
  const identity = leadToIdentityInput(lead);
  const seeds = await listSeedRecords();

  for (const seed of seeds) {
    if (!PIPELINE_STATUSES.has(seed.verificationStatus)) continue;
    const score = computeIdentityScore(identity, {
      businessName: seed.normalized.businessName,
      phone: seed.normalized.phone,
      email: seed.normalized.email,
      website: seed.normalized.website,
      latitude: null,
      longitude: null,
    });
    if (score > 95) {
      return {
        duplicate: true,
        existingSeedId: seed.id,
        message: 'Already exists in Discovery pipeline.',
      };
    }
  }

  const prisma = getPrismaClient();
  const name = trim(lead.businessName);
  if (name) {
    const orClauses: Array<Record<string, unknown>> = [{ name: { contains: name } }];
    const phone = trim(lead.phone);
    if (phone) orClauses.push({ phone });

    const businesses = await prisma.business.findMany({
      where: { OR: orClauses },
      select: { id: true, name: true, phone: true, lat: true, lng: true },
      take: 100,
    });

    for (const business of businesses) {
      const score = computeIdentityScore(identity, {
        businessName: business.name,
        phone: business.phone,
        email: null,
        website: null,
        latitude: business.lat,
        longitude: business.lng,
      });
      if (score > 95) {
        return {
          duplicate: true,
          message: 'Already exists in Discovery pipeline.',
        };
      }
    }
  }

  return { duplicate: false };
}

export async function promoteLeadToSeed(params: {
  leadId: string;
  requestedBy: string | null;
  batchName?: string | null;
}): Promise<PromoteLeadToSeedResult> {
  const prisma = getPrismaClient();
  const lead = await prisma.executiveLead.findUnique({ where: { id: params.leadId } });
  if (!lead) {
    return { ok: false, error: 'not_found', message: 'Executive lead not found.' };
  }

  if (lead.businessSeedId) {
    return {
      ok: false,
      error: 'already_promoted',
      message: 'Lead already promoted to Discovery.',
      duplicate: true,
      existingSeedId: lead.businessSeedId,
    };
  }

  const leadInput: ExecutiveLeadInput = {
    businessName: lead.businessName,
    ownerName: lead.ownerName,
    email: lead.email,
    phone: lead.phone,
    website: lead.website,
    category: lead.category,
    address: lead.address,
    suburb: lead.suburb,
    city: lead.city,
    state: lead.state,
    postcode: lead.postcode,
    country: lead.country,
    lat: lead.lat,
    lng: lead.lng,
    source: lead.source,
    consentStatus: lead.consentStatus,
  };

  const validation = validateLeadInput(leadInput);
  if (!validation.ok) {
    return {
      ok: false,
      error: 'validation_error',
      message: validation.errors.join('; ') || 'Lead validation failed.',
    };
  }

  const dup = await findLeadPromotionDuplicate(leadInput);
  if (dup.duplicate) {
    return {
      ok: false,
      error: 'duplicate_in_pipeline',
      message: dup.message ?? 'Already exists in Discovery pipeline.',
      duplicate: true,
      existingSeedId: dup.existingSeedId,
    };
  }

  const job = createDiscoveryJob({
    provider: 'partner_import',
    region: lead.city ?? lead.state ?? null,
    category: lead.category ?? null,
    params: {
      origin: 'executive_lead_promotion',
      executiveLeadId: lead.id,
      batchName: params.batchName ?? null,
    },
  });

  await appendDiscoveryJob(job);
  await updateDiscoveryJob(job.id, { status: 'running' });
  const startedAt = job.startedAt;

  try {
    const candidate = leadToCandidate(lead);
    const promotion = await discoveryPromotionPipeline.promote([candidate], {
      batchId: `executive-lead-promotion-${job.id}`,
      campaignId: lead.id,
    });

    if (!promotion.seeds.length) {
      const completedAt = new Date().toISOString();
      await updateDiscoveryJob(job.id, {
        status: 'completed',
        recordsFound: 1,
        recordsAccepted: 0,
        recordsRejected: 1,
        completedAt,
        error: promotion.rejectedDuplicates.length
          ? 'Duplicate rejected by identity engine'
          : 'Promotion produced no seeds',
      });
      await recordDiscoveryIngestionRun({
        discoveryJobId: job.id,
        provider: 'partner_import',
        startedAt,
        completedAt,
        candidatesFound: 1,
        seedsCreated: 0,
        seedsUpdated: 0,
        duplicatesRejected: promotion.rejectedDuplicates.length || 1,
        status: 'completed',
      });

      return {
        ok: false,
        error: 'duplicate_in_pipeline',
        message: 'Already exists in Discovery pipeline.',
        duplicate: true,
      };
    }

    const seed = promotion.seeds[0]!;
    assertDiscoverySeedsGoverned([seed]);

    const quality = businessQualityScorer.score(seed.normalized, seed.resolution);
    const enrichedSeed: IngestedSeedRecord = {
      ...seed,
      qualityScore: quality.qualityScore,
      qualityTier: quality.tier,
    };
    await upsertSeedRecords([enrichedSeed]);

    await recordSeedLifecycleTransition({
      seedId: enrichedSeed.id,
      fromStatus: 'seeded_pending_qa',
      toStatus: 'seeded_pending_qa',
      lifecycleStage: toGovernedLifecycleStage('seeded_pending_qa'),
      action: 'discovery_ingested',
      actorId: params.requestedBy ?? 'system',
      actorType: 'admin',
      reason: 'Executive lead promoted to Discovery Engine V1',
      metadata: {
        executiveLeadId: lead.id,
        discoveryJobId: job.id,
        provider: 'partner_import',
        origin: 'growth_command_center',
      },
    });

    const completedAt = new Date().toISOString();
    await updateDiscoveryJob(job.id, {
      status: 'completed',
      recordsFound: 1,
      recordsAccepted: promotion.seedsCreated + promotion.seedsUpdated,
      recordsRejected: promotion.rejectedDuplicates.length,
      completedAt,
    });

    await recordDiscoveryIngestionRun({
      discoveryJobId: job.id,
      provider: 'partner_import',
      startedAt,
      completedAt,
      candidatesFound: 1,
      seedsCreated: promotion.seedsCreated,
      seedsUpdated: promotion.seedsUpdated,
      duplicatesRejected: promotion.rejectedDuplicates.length,
      status: 'completed',
    });

    await prisma.executiveLead.update({
      where: { id: lead.id },
      data: {
        businessSeedId: enrichedSeed.id,
        leadStatus: 'promoted_to_discovery',
        dataQualityScore: quality.qualityScore,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'promoted_to_discovery',
        message: `Lead promoted to Discovery seed ${enrichedSeed.id} — status: seeded_pending_qa`,
        createdBy: params.requestedBy,
        metadata: {
          seedId: enrichedSeed.id,
          discoveryJobId: job.id,
          verificationStatus: 'seeded_pending_qa',
        },
      },
    });

    return {
      ok: true,
      seedId: enrichedSeed.id,
      status: 'seeded_pending_qa',
      message: 'Lead promoted successfully.',
      discoveryJobId: job.id,
      seed: enrichedSeed,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Promotion failed';
    const completedAt = new Date().toISOString();
    await updateDiscoveryJob(job.id, {
      status: 'failed',
      recordsFound: 1,
      recordsAccepted: 0,
      recordsRejected: 0,
      completedAt,
      error: message,
    });
    await recordDiscoveryIngestionRun({
      discoveryJobId: job.id,
      provider: 'partner_import',
      startedAt,
      completedAt,
      candidatesFound: 1,
      seedsCreated: 0,
      seedsUpdated: 0,
      duplicatesRejected: 0,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: 'promotion_failed', message };
  }
}

export async function runPromoteLeadsToDiscovery(input: {
  name: string;
  region?: string | null;
  category?: string | null;
  quantity: number;
  requestedBy: string | null;
  confirmed?: boolean;
}) {
  if (input.quantity > 10 && !input.confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: 'Batch lead promotion over 10 requires explicit confirmation',
    };
  }

  const prisma = getPrismaClient();
  const batch = await prisma.growthBatch.create({
    data: {
      name: input.name.trim(),
      region: trim(input.region),
      category: trim(input.category),
      quantityRequested: input.quantity,
      autoCreateMode: 'promote_to_discovery',
      requireReview: true,
      status: 'running',
      requestedBy: input.requestedBy,
      sourceLeadIds: [],
      createdStoreIds: [],
      reviewQueueIds: [],
    },
  });

  const where: Record<string, unknown> = {
    leadStatus: { in: ['qualified', 'enriched', 'new'] },
    businessSeedId: null,
  };
  if (input.region) {
    where.OR = [
      { city: { contains: input.region } },
      { state: { contains: input.region } },
      { suburb: { contains: input.region } },
    ];
  }
  if (input.category) where.category = { contains: input.category };

  const leads = await prisma.executiveLead.findMany({
    where,
    orderBy: { dataQualityScore: 'desc' },
    take: input.quantity,
  });

  const sourceLeadIds: string[] = [];
  const promotedSeedIds: string[] = [];
  const errors: Array<{ leadId: string; error: string }> = [];

  for (const lead of leads) {
    sourceLeadIds.push(lead.id);
    const result = await promoteLeadToSeed({
      leadId: lead.id,
      requestedBy: input.requestedBy,
      batchName: input.name,
    });
    if (result.ok) {
      promotedSeedIds.push(result.seedId);
    } else {
      errors.push({ leadId: lead.id, error: result.message });
    }
  }

  const quantityPromoted = promotedSeedIds.length;
  const completed = await prisma.growthBatch.update({
    where: { id: batch.id },
    data: {
      status: errors.length && !quantityPromoted ? 'failed' : 'completed',
      quantityCreated: quantityPromoted,
      sourceLeadIds,
      reviewQueueIds: promotedSeedIds,
      createdStoreIds: [],
      errorSummary: errors.length ? errors : undefined,
      completedAt: new Date(),
    },
  });

  return {
    ok: true,
    batch: completed,
    quantityPromoted,
    promotedSeedIds,
    errors,
  };
}
