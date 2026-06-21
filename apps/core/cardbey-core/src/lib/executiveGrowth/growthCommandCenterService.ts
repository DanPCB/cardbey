/**
 * Growth Command Center service — CRM, lead import, Discovery promotion, outreach.
 * Store creation is governed by Discovery Engine V1 only (see growthGovernanceConfig).
 */

import { getPrismaClient } from '../prisma.js';
import { buildSeedStorePreview } from '../businessIngestion/SeedStoreBuilder.js';
import { buildIngestionDashboardMetrics, listQaQueue } from '../businessIngestion/index.js';
import { listSeedRecords } from '../businessIngestion/IngestionRepository.js';
import { sendMail } from '../../services/email/mailer.js';
import {
  isLegacyGrowthStoreCreationEnabled,
  LEGACY_STORE_CREATION_DISABLED_MESSAGE,
} from './growthGovernanceConfig.js';

export const LEAD_STATUSES = [
  'new',
  'enriched',
  'qualified',
  'queued_for_creation',
  'promoted_to_discovery',
  'draft_created',
  'review_required',
  'contacted',
  'interested',
  'onboarded',
  'rejected',
  'unsubscribed',
] as const;

export type LeadInput = {
  businessName: string;
  ownerName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: string | null;
  notes?: string | null;
  consentStatus?: string | null;
  leadStatus?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trim(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = trim(email);
  return e ? e.toLowerCase() : null;
}

export function computeLeadDataQualityScore(lead: LeadInput): number {
  let score = 0;
  if (normalizeEmail(lead.email) && EMAIL_RE.test(normalizeEmail(lead.email)!)) score += 20;
  if (trim(lead.businessName)) score += 20;
  if (trim(lead.city) || trim(lead.suburb) || Number.isFinite(lead.lat)) score += 25;
  if (trim(lead.category)) score += 15;
  if (trim(lead.website)) score += 10;
  if (lead.consentStatus === 'granted') score += 10;
  return Math.min(100, score);
}

export function validateLeadInput(lead: LeadInput): {
  ok: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!trim(lead.businessName)) errors.push('Business name is required');
  const email = normalizeEmail(lead.email);
  if (email && !EMAIL_RE.test(email)) errors.push('Invalid email format');
  if (!trim(lead.city) && !trim(lead.suburb) && !Number.isFinite(lead.lat)) {
    warnings.push('Missing location — city or coordinates recommended');
  }
  if (lead.consentStatus !== 'granted' && email) {
    warnings.push('Consent not confirmed — outreach may be restricted');
  }
  return { ok: errors.length === 0, warnings, errors };
}

function systemUserId(): string | null {
  return process.env.DISCOVERY_SYSTEM_USER_ID?.trim() || process.env.INGESTION_SYSTEM_USER_ID?.trim() || null;
}

function buildDraftPreviewFromLead(lead: LeadInput) {
  return buildSeedStorePreview({
    businessName: lead.businessName.trim(),
    businessType: trim(lead.category) ?? 'general',
    address: trim(lead.address),
    phone: trim(lead.phone),
    website: trim(lead.website),
    email: trim(lead.email),
    region: trim(lead.state),
    country: trim(lead.country),
    state: trim(lead.state),
    city: trim(lead.city),
    owner: null,
    claimable: true,
    publicVisibility: 'limited',
    provenance: 'executive_lead',
    sourceType: 'executive_growth',
    sourceReference: trim(lead.source) ?? 'growth_command_center',
    sourceRowId: '',
    ingestedAt: new Date().toISOString(),
    qualityScore: computeLeadDataQualityScore(lead),
    confidenceScore: 0.7,
    verificationStatus: 'review_required',
    registrationNumber: null,
  });
}

async function createDraftFromLead(leadId: string, lead: LeadInput, requestedBy: string | null) {
  const prisma = getPrismaClient();
  const ownerId = systemUserId();
  if (!ownerId) {
    return { ok: false as const, error: 'INGESTION_SYSTEM_USER_ID not configured' };
  }

  const preview = buildDraftPreviewFromLead(lead);
  const draft = await prisma.draftStore.create({
    data: {
      mode: 'template',
      status: 'ready',
      ownerUserId: ownerId,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      address: trim(lead.address),
      suburb: trim(lead.suburb),
      state: trim(lead.state),
      postcode: trim(lead.postcode),
      country: trim(lead.country),
      city: trim(lead.city),
      lat: Number.isFinite(lead.lat) ? lead.lat : undefined,
      lng: Number.isFinite(lead.lng) ? lead.lng : undefined,
      phone: trim(lead.phone),
      email: trim(lead.email),
      input: {
        businessName: lead.businessName.trim(),
        businessType: trim(lead.category) ?? 'general',
        location: [trim(lead.suburb), trim(lead.city), trim(lead.state), trim(lead.country)].filter(Boolean).join(', '),
        source: 'executive_growth',
        executiveLeadId: leadId,
        missionType: 'growth_acquisition_batch',
        requestedBy,
        requireHumanReview: true,
      },
      preview,
      publishSnapshot: preview,
      publishSnapshotVersion: 1,
    },
  });

  const nextStatus = 'draft_created';
  await prisma.executiveLead.update({
    where: { id: leadId },
    data: {
      draftStoreId: draft.id,
      leadStatus: nextStatus,
      dataQualityScore: computeLeadDataQualityScore(lead),
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'batch_created',
      message: `Draft store created (${draft.id}) — review required before publish`,
      createdBy: requestedBy,
      metadata: { draftStoreId: draft.id, published: false },
    },
  });

  return { ok: true as const, draftId: draft.id };
}

export async function buildGrowthSummaryMetrics() {
  const prisma = getPrismaClient();
  const [
    totalLeads,
    qualifiedLeads,
    promotedToDiscovery,
    onboarded,
    batches,
    campaigns,
    promotedLeadRows,
  ] = await Promise.all([
    prisma.executiveLead.count(),
    prisma.executiveLead.count({ where: { leadStatus: { in: ['qualified', 'enriched'] } } }),
    prisma.executiveLead.count({
      where: {
        OR: [{ businessSeedId: { not: null } }, { leadStatus: 'promoted_to_discovery' }],
      },
    }),
    prisma.executiveLead.count({ where: { leadStatus: 'onboarded' } }),
    prisma.growthBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.outreachCampaign.aggregate({ _sum: { sentCount: true, replyCount: true } }),
    prisma.executiveLead.findMany({
      where: { businessSeedId: { not: null } },
      select: { businessSeedId: true },
    }),
  ]);

  const seedIds = promotedLeadRows
    .map((row) => row.businessSeedId)
    .filter((id): id is string => Boolean(id));

  let leadsPendingQa = 0;
  let leadsClaimed = 0;
  if (seedIds.length) {
    const seeds = await listSeedRecords();
    const byId = new Map(seeds.map((s) => [s.id, s]));
    for (const seedId of seedIds) {
      const seed = byId.get(seedId);
      if (!seed) continue;
      if (seed.verificationStatus === 'seeded_pending_qa') leadsPendingQa++;
      if (
        seed.verificationStatus === 'claim_pending' ||
        seed.verificationStatus === 'verified_owner' ||
        seed.verificationStatus === 'active'
      ) {
        leadsClaimed++;
      }
      if (seed.verificationStatus === 'active') {
        // counted in converted via onboarded + active seeds below
      }
    }
  }

  const activeSeedConversions = seedIds.length
    ? (await listSeedRecords()).filter(
        (s) => seedIds.includes(s.id) && s.verificationStatus === 'active',
      ).length
    : 0;

  const ingestion = await buildIngestionDashboardMetrics().catch(() => null);

  return {
    totalLeads,
    qualifiedLeads,
    promotedToDiscovery,
    leadsPendingQa,
    leadsClaimed,
    convertedBusinesses: onboarded + activeSeedConversions,
    marketingEmailsSent: campaigns._sum.sentCount ?? 0,
    repliesInterested: campaigns._sum.replyCount ?? 0,
    leadsPendingQa,
    leadsClaimed,
    ingestionSeedsPendingQa: ingestion?.byVerificationStatus?.seeded_pending_qa ?? null,
    recentBatches: batches,
    legacyStoreCreationEnabled: isLegacyGrowthStoreCreationEnabled(),
    /** @deprecated Use promotedToDiscovery */
    storeAutoCreationQueue: 0,
    /** @deprecated Legacy draft-store batch metric */
    createdDraftStores: await prisma.executiveLead.count({ where: { leadStatus: 'draft_created' } }),
    /** @deprecated */
    readyForReview: leadsPendingQa,
  };
}

export async function importExecutiveLeads(
  leads: LeadInput[],
  opts: { source?: string; createdBy?: string | null; skipDuplicates?: boolean },
) {
  const prisma = getPrismaClient();
  const results: Array<{
    index: number;
    ok: boolean;
    leadId?: string;
    warnings: string[];
    errors: string[];
    duplicate?: boolean;
  }> = [];

  for (let i = 0; i < leads.length; i++) {
    const raw = leads[i]!;
    const validation = validateLeadInput(raw);
    if (!validation.ok) {
      results.push({ index: i, ok: false, warnings: validation.warnings, errors: validation.errors });
      continue;
    }

    const email = normalizeEmail(raw.email);
    if (email && opts.skipDuplicates !== false) {
      const existing = await prisma.executiveLead.findFirst({ where: { email } });
      if (existing) {
        results.push({
          index: i,
          ok: false,
          duplicate: true,
          warnings: validation.warnings,
          errors: ['Duplicate email'],
        });
        continue;
      }
    }

    const score = computeLeadDataQualityScore(raw);
    const created = await prisma.executiveLead.create({
      data: {
        businessName: raw.businessName.trim(),
        ownerName: trim(raw.ownerName),
        email,
        phone: trim(raw.phone),
        website: trim(raw.website),
        category: trim(raw.category),
        address: trim(raw.address),
        addressLine2: trim(raw.addressLine2),
        suburb: trim(raw.suburb),
        city: trim(raw.city),
        state: trim(raw.state),
        postcode: trim(raw.postcode),
        country: trim(raw.country),
        lat: Number.isFinite(raw.lat) ? raw.lat : null,
        lng: Number.isFinite(raw.lng) ? raw.lng : null,
        source: trim(raw.source) ?? trim(opts.source) ?? 'executive_import',
        notes: trim(raw.notes),
        consentStatus: trim(raw.consentStatus) ?? 'unknown',
        leadStatus: trim(raw.leadStatus) ?? (score >= 60 ? 'qualified' : 'new'),
        dataQualityScore: score,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: created.id,
        type: 'import',
        message: 'Lead imported via Growth Command Center',
        createdBy: opts.createdBy ?? null,
        metadata: { source: created.source, score },
      },
    });

    results.push({ index: i, ok: true, leadId: created.id, warnings: validation.warnings, errors: [] });
  }

  const imported = results.filter((r) => r.ok).length;
  return { imported, total: leads.length, results };
}

export async function listExecutiveLeads(filters: Record<string, string | undefined> = {}) {
  const prisma = getPrismaClient();
  const where: Record<string, unknown> = {};

  if (filters.city) where.city = filters.city;
  if (filters.category) where.category = filters.category;
  if (filters.status) where.leadStatus = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.missingEmail === 'true') where.email = null;
  if (filters.missingLocation === 'true') {
    where.AND = [{ city: null }, { suburb: null }, { lat: null }];
  }
  if (filters.readyForCreation === 'true') {
    where.leadStatus = { in: ['qualified', 'enriched'] };
  }
  if (filters.readyForOutreach === 'true') {
    where.businessSeedId = { not: null };
    where.leadStatus = { in: ['promoted_to_discovery', 'contacted'] };
    where.consentStatus = { not: 'denied' };
    where.NOT = { leadStatus: 'unsubscribed' };
  }

  return prisma.executiveLead.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Number(filters.limit) || 100, 500),
  });
}

export async function updateExecutiveLead(
  leadId: string,
  patch: Partial<LeadInput> & { leadStatus?: string },
  actorId: string | null,
) {
  const prisma = getPrismaClient();
  const data: Record<string, unknown> = {};
  for (const key of [
    'businessName', 'ownerName', 'email', 'phone', 'website', 'category',
    'address', 'addressLine2', 'suburb', 'city', 'state', 'postcode', 'country',
    'source', 'notes', 'consentStatus', 'leadStatus',
  ] as const) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  if (patch.lat !== undefined) data.lat = patch.lat;
  if (patch.lng !== undefined) data.lng = patch.lng;

  const updated = await prisma.executiveLead.update({ where: { id: leadId }, data });
  await prisma.leadActivity.create({
    data: {
      leadId,
      type: 'status_change',
      message: `Lead updated`,
      createdBy: actorId,
      metadata: patch,
    },
  });
  return updated;
}

export async function runGrowthStoreBatch(input: {
  name: string;
  region?: string | null;
  category?: string | null;
  quantity: number;
  autoCreateMode?: string;
  requireReview?: boolean;
  requestedBy: string | null;
  confirmed?: boolean;
}) {
  if (!isLegacyGrowthStoreCreationEnabled()) {
    return {
      ok: false,
      error: 'legacy_disabled',
      message: LEGACY_STORE_CREATION_DISABLED_MESSAGE,
    };
  }
  if (input.quantity > 10 && !input.confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: 'Batch store creation over 10 requires explicit confirmation',
    };
  }

  const prisma = getPrismaClient();
  const batch = await prisma.growthBatch.create({
    data: {
      name: input.name.trim(),
      region: trim(input.region),
      category: trim(input.category),
      quantityRequested: input.quantity,
      autoCreateMode: input.autoCreateMode ?? 'draft_only',
      requireReview: input.requireReview !== false,
      status: 'running',
      requestedBy: input.requestedBy,
      sourceLeadIds: [],
      createdStoreIds: [],
      reviewQueueIds: [],
    },
  });

  const where: Record<string, unknown> = {
    leadStatus: { in: ['qualified', 'enriched', 'new'] },
    draftStoreId: null,
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
  const reviewQueueIds: string[] = [];
  const errors: Array<{ leadId: string; error: string }> = [];

  for (const lead of leads) {
    sourceLeadIds.push(lead.id);
    await prisma.executiveLead.update({
      where: { id: lead.id },
      data: { leadStatus: 'queued_for_creation' },
    });

    const result = await createDraftFromLead(
      lead.id,
      {
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
      },
      input.requestedBy,
    );

    if (result.ok) {
      reviewQueueIds.push(result.draftId);
      if (input.autoCreateMode === 'draft_review') {
        await prisma.executiveLead.update({
          where: { id: lead.id },
          data: { leadStatus: 'review_required' },
        });
      }
    } else {
      errors.push({ leadId: lead.id, error: result.error ?? 'Draft creation failed' });
    }
  }

  const quantityCreated = reviewQueueIds.length;
  const completed = await prisma.growthBatch.update({
    where: { id: batch.id },
    data: {
      status: errors.length && !quantityCreated ? 'failed' : 'completed',
      quantityCreated,
      sourceLeadIds,
      reviewQueueIds,
      createdStoreIds: [],
      errorSummary: errors.length ? errors : undefined,
      completedAt: new Date(),
    },
  });

  return {
    ok: true,
    batch: completed,
    quantityCreated,
    errors,
    reviewQueueIds,
  };
}

export async function runGrowthReadinessAudit() {
  const prisma = getPrismaClient();
  const [qaPending, ingestion, promotedCount] = await Promise.all([
    listQaQueue({ status: 'seeded_pending_qa' }).catch(() => []),
    buildIngestionDashboardMetrics().catch(() => null),
    prisma.executiveLead.count({ where: { businessSeedId: { not: null } } }),
  ]);

  const seedsPendingQa = ingestion?.byVerificationStatus?.seeded_pending_qa ?? qaPending.length;
  const seedsClaimable = ingestion?.byVerificationStatus?.seeded_claimable ?? 0;
  const seedsActive = ingestion?.byVerificationStatus?.active ?? 0;

  const recommendedNextAction =
    seedsPendingQa > 0
      ? `Review ${seedsPendingQa} seeds in QA queue (Discovery Center)`
      : promotedCount === 0
        ? 'Import and qualify leads, then promote to Discovery'
        : seedsClaimable > 0
          ? `Monitor ${seedsClaimable} claimable seeds in Claims queue`
          : 'Send outreach to promoted leads with governed claim links';

  return {
    totalDiscoveredStores: ingestion?.totalSeeds ?? 0,
    storesWithMissingLocation: 0,
    storesWithMissingHero: 0,
    storesWithMissingCategory: 0,
    storesReadyForOutreach: promotedCount,
    storesBlocked: 0,
    qaPendingCount: seedsPendingQa,
    recommendedNextAction,
    statuses: {
      ready: promotedCount,
      needsLocation: 0,
      needsMedia: 0,
      needsReview: seedsPendingQa,
      blocked: 0,
    },
    promotedLeads: promotedCount,
    activeSeeds: seedsActive,
  };
}

const OUTREACH_TEMPLATES: Record<string, { subject: string; body: string }> = {
  introduction: {
    subject: 'Introducing Cardbey for {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>We built a preview for <strong>{{businessName}}</strong> in {{city}}.</p><p><a href="{{storePreviewUrl}}">View your store preview</a> · <a href="{{claimStoreUrl}}">Claim your store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  claim_preview: {
    subject: 'Claim your AI-created store preview — {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>Your {{category}} business in {{city}} has a Cardbey preview ready.</p><p><a href="{{claimStoreUrl}}">Claim your store</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  improve_presence: {
    subject: 'Improve your online presence — {{businessName}}',
    body: `<p>Hi {{ownerName}},</p><p>Cardbey can help {{businessName}} reach more customers in {{city}}.</p><p><a href="{{storePreviewUrl}}">See preview</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
  vietnamese_sme: {
    subject: 'Cardbey — dành cho doanh nghiệp {{businessName}}',
    body: `<p>Xin chào {{ownerName}},</p><p>Chúng tôi đã tạo bản xem trước cho {{businessName}} tại {{city}}.</p><p><a href="{{claimStoreUrl}}">Nhận cửa hàng</a></p><p><a href="{{unsubscribeUrl}}">Hủy đăng ký</a></p>`,
  },
  follow_up: {
    subject: 'Following up — {{businessName}} on Cardbey',
    body: `<p>Hi {{ownerName}},</p><p>Just checking in about your Cardbey preview for {{businessName}}.</p><p><a href="{{storePreviewUrl}}">View preview</a></p><p><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function sendGrowthOutreach(input: {
  name: string;
  templateId: string;
  targetLeadIds: string[];
  testEmail?: string | null;
  requestedBy: string | null;
  confirmed?: boolean;
  customBody?: string | null;
}) {
  if (input.targetLeadIds.length > 10 && !input.confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      message: 'Batch email send over 10 requires explicit confirmation',
    };
  }

  const prisma = getPrismaClient();
  const template = OUTREACH_TEMPLATES[input.templateId] ?? OUTREACH_TEMPLATES.introduction;
  const bodyTemplate = input.customBody?.trim() || template.body;

  const campaign = await prisma.outreachCampaign.create({
    data: {
      name: input.name.trim(),
      templateId: input.templateId,
      templateBody: bodyTemplate,
      targetLeadIds: input.targetLeadIds,
      status: 'sending',
      requestedBy: input.requestedBy,
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  const leads = input.testEmail
    ? [{
        id: 'test',
        email: input.testEmail,
        businessName: 'Test Business',
        ownerName: 'Test',
        city: 'Melbourne',
        category: 'Food',
        draftStoreId: null,
        businessSeedId: 'test-seed-id',
      }]
    : await prisma.executiveLead.findMany({ where: { id: { in: input.targetLeadIds } } });

  for (const lead of leads) {
    if (!input.testEmail) {
      if (lead.leadStatus === 'unsubscribed' || lead.consentStatus === 'denied') {
        failedCount++;
        continue;
      }
      const email = normalizeEmail(lead.email);
      if (!email || !EMAIL_RE.test(email)) {
        failedCount++;
        continue;
      }
      if (!lead.businessSeedId) {
        failedCount++;
        continue;
      }
    }

    const email = input.testEmail ?? normalizeEmail(lead.email)!;
    const seedId = lead.businessSeedId ?? 'test-seed-id';
    const vars = {
      businessName: lead.businessName ?? 'your business',
      ownerName: lead.ownerName ?? 'there',
      storePreviewUrl: `https://cardbey.com/activate-business/${seedId}`,
      category: lead.category ?? 'business',
      city: lead.city ?? 'your area',
      claimStoreUrl: `https://cardbey.com/activate-business/${seedId}`,
      unsubscribeUrl: `https://cardbey.com/unsubscribe?lead=${lead.id}`,
    };

    const html = renderTemplate(bodyTemplate, vars);
    const subject = renderTemplate(template.subject, vars);
    const mailResult = await sendMail({ to: email, subject, html });

    if (mailResult.ok) {
      sentCount++;
      if (!input.testEmail && lead.id !== 'test') {
        await prisma.executiveLead.update({
          where: { id: lead.id },
          data: { leadStatus: 'contacted', lastContactedAt: new Date() },
        });
        await prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'email_sent',
            message: `Outreach sent: ${input.templateId}`,
            createdBy: input.requestedBy,
            metadata: { campaignId: campaign.id, templateId: input.templateId },
          },
        });
      }
    } else {
      failedCount++;
    }
  }

  const updated = await prisma.outreachCampaign.update({
    where: { id: campaign.id },
    data: {
      status: sentCount > 0 ? 'sent' : 'failed',
      sentCount,
      failedCount,
      completedAt: new Date(),
    },
  });

  return { ok: true, campaign: updated, sentCount, failedCount };
}

export async function getGrowthBatchStatus(batchId: string) {
  const prisma = getPrismaClient();
  return prisma.growthBatch.findUnique({ where: { id: batchId } });
}

export function parseCsvLeads(csvText: string, source?: string): LeadInput[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const idx = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? cols[i] || null : null;
    };
    return {
      businessName: get('businessname') ?? get('name') ?? '',
      ownerName: get('ownername'),
      email: get('email'),
      phone: get('phone'),
      website: get('website'),
      category: get('category'),
      address: get('address') ?? get('addressline1'),
      suburb: get('suburb'),
      city: get('city'),
      state: get('state'),
      postcode: get('postcode'),
      country: get('country'),
      source: get('source') ?? source ?? 'csv_import',
      notes: get('notes'),
      consentStatus: get('consentstatus') ?? 'unknown',
    } satisfies LeadInput;
  }).filter((l) => l.businessName.trim());
}
