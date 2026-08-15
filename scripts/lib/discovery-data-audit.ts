/**
 * Discovery / pre-creation data audit, classification, tagging, and cleanup planning.
 *
 * Read-only by default. Mutations only via tagTestRecords() and executeCleanupPlan({ apply: true }).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const CORE_ROOT = path.join(REPO_ROOT, 'apps', 'core', 'cardbey-core');

export type CreatedBySource =
  | 'manual'
  | 'discovery_seed'
  | 'activation_test'
  | 'qa_test'
  | 'runtime_test'
  | 'mock_seed'
  | 'unknown';

export type RecordClassification = 'preserve' | 'test_data' | 'review_required';

export interface TestMetadata {
  isTestData?: boolean;
  testBatchId?: string | null;
  createdBySource?: CreatedBySource;
}

export interface IngestedSeedRecord {
  id: string;
  normalized: {
    businessName: string | null;
    sourceType: string;
    sourceReference: string;
    sourceRowId: string;
    email: string | null;
    city: string | null;
  };
  verificationStatus: string;
  claimable: boolean;
  ownerUserId: string | null;
  storeId: string | null;
  draftId: string | null;
  createdAt: string;
  updatedAt: string;
  firstSeenAt?: string | null;
  claimStartedAt?: string | null;
  verifiedAt?: string | null;
  activatedAt?: string | null;
  operatingStartedAt?: string | null;
  isTestData?: boolean;
  testBatchId?: string | null;
  createdBySource?: CreatedBySource;
  batchId?: string | null;
  campaignId?: string | null;
}

export interface EnrichmentCandidate {
  id: string;
  seedId: string;
  field: string;
  status: string;
  createdAt: string;
}

export interface IngestionClaimRequest {
  id: string;
  seedId: string;
  claimStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeedSuitcase {
  seedId: string;
  biSnapshot: { snapshotId: string } | null;
  activationNarrative: unknown | null;
  migratedToStoreId: string | null;
  createdAt: string;
}

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  userId: string;
  isActive: boolean;
  publishedAt: Date | null;
  provenance: string | null;
  claimStatus: string | null;
  createdAt: Date;
  email: string | null;
  user?: { id: string; email: string | null; role: string | null } | null;
}

export interface DraftStoreRow {
  id: string;
  status: string;
  mode: string;
  ownerUserId: string | null;
  guestSessionId: string | null;
  committedStoreId: string | null;
  createdAt: Date;
  expiresAt: Date;
  input: unknown;
}

export interface PreserveFlags {
  hasActiveOwner: boolean;
  hasDevices: boolean;
  hasCampaigns: boolean;
  hasContent: boolean;
  hasMissions: boolean;
  hasRuntimeHistory: boolean;
  isPublished: boolean;
  hasProducts: boolean;
}

export interface ClassifiedStore {
  id: string;
  slug: string;
  name: string;
  classification: RecordClassification;
  createdBySource: CreatedBySource;
  storeStatus: string;
  activationState: string;
  ownerEmail: string | null;
  preserveFlags: PreserveFlags;
  reasons: string[];
}

export interface ClassifiedSeed {
  id: string;
  businessName: string | null;
  verificationStatus: string;
  classification: RecordClassification;
  createdBySource: CreatedBySource;
  storeId: string | null;
  draftId: string | null;
  reasons: string[];
}

export interface ClassifiedDraft {
  id: string;
  status: string;
  classification: RecordClassification;
  createdBySource: CreatedBySource;
  committedStoreId: string | null;
  reasons: string[];
}

export type AuditSeedSource = 'db' | 'file';

export interface AuditContext {
  generatedAt: string;
  databaseUrlRedacted: string;
  ingestionDir: string;
  /** Where seed inventory was loaded from — must match import backend when DB is available. */
  seedSource: AuditSeedSource;
  businesses: BusinessRow[];
  drafts: DraftStoreRow[];
  seeds: IngestedSeedRecord[];
  suitcases: SeedSuitcase[];
  enrichmentCandidates: EnrichmentCandidate[];
  claims: IngestionClaimRequest[];
  unclaimedStores: Array<{ id: string; slug: string; status: string; discoveryBatch: string | null }>;
  storeIdsWithDevices: Set<string>;
  storeIdsWithCampaigns: Set<string>;
  storeIdsWithMissions: Set<string>;
  storeIdsWithRuntime: Set<string>;
  storeIdsWithProducts: Set<string>;
  userEmailsById: Map<string, string | null>;
  retiredSlugs: Set<string>;
}

export interface AuditReport {
  context: AuditContext;
  stores: ClassifiedStore[];
  seeds: ClassifiedSeed[];
  drafts: ClassifiedDraft[];
  summary: {
    preserveStores: number;
    deleteCandidateStores: number;
    reviewStores: number;
    preserveSeeds: number;
    deleteCandidateSeeds: number;
    reviewSeeds: number;
    preserveDrafts: number;
    deleteCandidateDrafts: number;
    reviewDrafts: number;
  };
  storeBreakdown: {
    total: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    byCreatedBySource: Record<string, number>;
    byCreatedAtDate: Record<string, number>;
    byActivationState: Record<string, number>;
  };
  seedBreakdown: {
    total: number;
    claimable: number;
    claimed: number;
    verified: number;
    activated: number;
    rejected: number;
    byVerificationStatus: Record<string, number>;
  };
  biBreakdown: {
    snapshots: number;
    seedSuitcases: number;
    activationSuitcases: number;
    enrichmentCandidates: number;
  };
  funnel: {
    discovery: number;
    claimable: number;
    claimed: number;
    verified: number;
    activated: number;
    operating: number;
  };
  metricsRebuild: {
    controlCenter: Record<string, number | string | null>;
    businessIngestion: Record<string, number | string | null>;
  };
}

export interface CleanupPlan {
  enrichmentCandidateIds: string[];
  seedIdsForSuitcaseRemoval: string[];
  claimIds: string[];
  seedIds: string[];
  draftIds: string[];
  storeIds: string[];
  rollback: {
    generatedAt: string;
    enrichmentCandidates: EnrichmentCandidate[];
    seeds: IngestedSeedRecord[];
    suitcases: SeedSuitcase[];
    claims: IngestionClaimRequest[];
    stores: BusinessRow[];
    drafts: DraftStoreRow[];
  };
}

const RETIRED_SLUGS = new Set(['shop-cafe', 'my-cafe', 'my-business', 'my-business-2']);

const TEST_EMAIL_PATTERNS = [
  /staging-p2p5-test@cardbey\.local/i,
  /\+test@/i,
  /@example\.com$/i,
  /@test\./i,
];

const TEST_NAME_PATTERNS = [
  /^staging test store$/i,
  /^test store$/i,
  /^qa test/i,
  /^runtime test/i,
  /^mock /i,
  /^sample /i,
];

const TEST_SOURCE_REF_PATTERNS = [
  /sample-opendata/i,
  /fixture/i,
  /audit_script/i,
  /activation-runway-test/i,
  /idempotent-test/i,
  /vitest/i,
  /test-batch/i,
];

export function ingestionDir(): string {
  return process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
}

export function testTagsFile(): string {
  return path.join(ingestionDir(), 'cleanup-test-tags.json');
}

function redactDatabaseUrl(url: string | undefined): string {
  if (!url) return '(not set)';
  if (url.startsWith('file:')) return url;
  return url.replace(/:\/\/[^@]+@/, '://***@').replace(/(password=)[^&]+/i, '$1***');
}

function dateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function readJsonInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function isTestEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim();
  if (!e) return false;
  return TEST_EMAIL_PATTERNS.some((re) => re.test(e));
}

export function isTestName(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  return TEST_NAME_PATTERNS.some((re) => re.test(n));
}

export function isTestSourceReference(ref: string | null | undefined): boolean {
  const r = String(ref ?? '').trim();
  if (!r) return false;
  return TEST_SOURCE_REF_PATTERNS.some((re) => re.test(r));
}

export function inferCreatedBySource(params: {
  provenance?: string | null;
  draftInput?: Record<string, unknown>;
  seed?: IngestedSeedRecord | null;
  ownerEmail?: string | null;
  name?: string | null;
  slug?: string | null;
}): CreatedBySource {
  const { provenance, draftInput, seed, ownerEmail, name, slug } = params;

  if (slug && RETIRED_SLUGS.has(slug.toLowerCase())) return 'qa_test';
  if (isTestEmail(ownerEmail) || isTestName(name)) return 'qa_test';

  const inputSource = String(draftInput?.source ?? draftInput?.sourceType ?? '').toLowerCase();
  if (inputSource.includes('audit_script') || inputSource.includes('runtime_test')) return 'runtime_test';
  if (inputSource.includes('activation_test') || inputSource.includes('activation')) return 'activation_test';
  if (inputSource.includes('mock')) return 'mock_seed';

  if (seed) {
    const ref = seed.normalized.sourceReference;
    if (isTestSourceReference(ref)) return 'mock_seed';
    if (seed.isTestData) return seed.createdBySource ?? 'qa_test';
    if (seed.normalized.sourceType === 'places_discovery' || seed.normalized.sourceType === 'website_discovery') {
      return 'discovery_seed';
    }
    if (seed.normalized.sourceType === 'owner_submission') return 'manual';
  }

  if (provenance === 'ingestion_seed') return 'discovery_seed';
  if (provenance === 'consumer_capture') return 'manual';
  if (provenance === 'owner') return 'manual';

  return 'unknown';
}

function storeStatusLabel(b: BusinessRow, seed: IngestedSeedRecord | null): string {
  if (b.slug && RETIRED_SLUGS.has(b.slug.toLowerCase())) return 'Retired';
  if (b.userId.startsWith('guest_')) return 'Guest Draft';
  if (seed?.verificationStatus === 'seeded_pending_qa') return 'Review';
  if (b.publishedAt || b.isActive) return 'Published';
  if (b.provenance === 'ingestion_seed' && b.claimStatus === 'unclaimed') return 'Ghost Seed';
  if (!b.publishedAt && !b.isActive) return 'Draft';
  return 'Other';
}

function activationStateLabel(seed: IngestedSeedRecord | null, b: BusinessRow): string {
  if (!seed) {
    if (b.publishedAt && b.isActive) return 'operating';
    if (b.claimStatus === 'claimed') return 'claimed';
    return 'unknown';
  }
  if (seed.storeId && seed.verificationStatus === 'active') return 'operating';
  if (seed.activatedAt || seed.verificationStatus === 'active') return 'activated';
  if (seed.verifiedAt || seed.verificationStatus === 'verified_owner') return 'verified';
  if (seed.claimStartedAt) return 'claimed';
  if (seed.verificationStatus === 'seeded_claimable') return 'claimable';
  if (seed.verificationStatus === 'seeded_pending_qa') return 'discovery';
  if (seed.verificationStatus === 'rejected') return 'rejected';
  return seed.verificationStatus;
}

function buildPreserveFlags(
  storeId: string,
  ctx: Pick<
    AuditContext,
    | 'storeIdsWithDevices'
    | 'storeIdsWithCampaigns'
    | 'storeIdsWithMissions'
    | 'storeIdsWithRuntime'
    | 'storeIdsWithProducts'
    | 'userEmailsById'
  >,
  business: BusinessRow,
): PreserveFlags {
  const ownerEmail = business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null;
  const hasRealOwner =
    Boolean(business.userId) &&
    !business.userId.startsWith('guest_') &&
    !isTestEmail(ownerEmail);

  return {
    hasActiveOwner: hasRealOwner,
    hasDevices: ctx.storeIdsWithDevices.has(storeId),
    hasCampaigns: ctx.storeIdsWithCampaigns.has(storeId),
    hasContent: false,
    hasMissions: ctx.storeIdsWithMissions.has(storeId),
    hasRuntimeHistory: ctx.storeIdsWithRuntime.has(storeId),
    isPublished: Boolean(business.publishedAt) || business.isActive,
    hasProducts: ctx.storeIdsWithProducts.has(storeId),
  };
}

function mustPreserve(flags: PreserveFlags): boolean {
  return (
    flags.hasDevices ||
    flags.hasCampaigns ||
    flags.hasMissions ||
    flags.hasRuntimeHistory ||
    flags.isPublished ||
    flags.hasProducts ||
    flags.hasActiveOwner
  );
}

export function classifyBusiness(
  business: BusinessRow,
  ctx: AuditContext,
  seedByStoreId: Map<string, IngestedSeedRecord>,
): ClassifiedStore {
  const seed = seedByStoreId.get(business.id) ?? null;
  const flags = buildPreserveFlags(business.id, ctx, business);
  const createdBySource = inferCreatedBySource({
    provenance: business.provenance,
    seed,
    ownerEmail: business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null,
    name: business.name,
    slug: business.slug,
  });

  const reasons: string[] = [];

  if (mustPreserve(flags)) {
    if (flags.hasDevices) reasons.push('has_devices');
    if (flags.hasCampaigns) reasons.push('has_campaigns');
    if (flags.hasMissions) reasons.push('has_missions');
    if (flags.hasRuntimeHistory) reasons.push('has_runtime_history');
    if (flags.isPublished) reasons.push('published');
    if (flags.hasProducts) reasons.push('has_products');
    if (flags.hasActiveOwner) reasons.push('real_owner');
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      classification: 'preserve',
      createdBySource,
      storeStatus: storeStatusLabel(business, seed),
      activationState: activationStateLabel(seed, business),
      ownerEmail: business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null,
      preserveFlags: flags,
      reasons,
    };
  }

  if (
    RETIRED_SLUGS.has(business.slug.toLowerCase()) ||
    business.userId.startsWith('guest_') ||
    isTestEmail(business.user?.email ?? business.email) ||
    isTestName(business.name) ||
    createdBySource === 'qa_test' ||
    createdBySource === 'runtime_test' ||
    createdBySource === 'activation_test' ||
    createdBySource === 'mock_seed' ||
    (business.provenance === 'ingestion_seed' && business.claimStatus === 'unclaimed' && !seed?.ownerUserId)
  ) {
    reasons.push('test_heuristic_match');
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      classification: 'test_data',
      createdBySource,
      storeStatus: storeStatusLabel(business, seed),
      activationState: activationStateLabel(seed, business),
      ownerEmail: business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null,
      preserveFlags: flags,
      reasons,
    };
  }

  if (seed?.verificationStatus === 'seeded_pending_qa' || (!business.publishedAt && !business.isActive)) {
    reasons.push('ambiguous_lifecycle');
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      classification: 'review_required',
      createdBySource,
      storeStatus: storeStatusLabel(business, seed),
      activationState: activationStateLabel(seed, business),
      ownerEmail: business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null,
      preserveFlags: flags,
      reasons,
    };
  }

  reasons.push('default_preserve');
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    classification: 'preserve',
    createdBySource,
    storeStatus: storeStatusLabel(business, seed),
    activationState: activationStateLabel(seed, business),
    ownerEmail: business.user?.email ?? ctx.userEmailsById.get(business.userId) ?? null,
    preserveFlags: flags,
    reasons,
  };
}

export function classifySeed(
  seed: IngestedSeedRecord,
  ctx: AuditContext,
  storeClassById: Map<string, ClassifiedStore>,
): ClassifiedSeed {
  const linkedStore = seed.storeId ? storeClassById.get(seed.storeId) : null;
  const reasons: string[] = [];
  const createdBySource =
    seed.createdBySource ??
    inferCreatedBySource({
      seed,
      name: seed.normalized.businessName,
      ownerEmail: seed.ownerUserId ? ctx.userEmailsById.get(seed.ownerUserId) ?? null : null,
    });

  if (seed.isTestData || linkedStore?.classification === 'preserve') {
    if (linkedStore?.classification === 'preserve') reasons.push('linked_store_preserved');
    if (seed.isTestData) reasons.push('explicit_isTestData');
    if (linkedStore?.classification === 'preserve' && !seed.isTestData) {
      return {
        id: seed.id,
        businessName: seed.normalized.businessName,
        verificationStatus: seed.verificationStatus,
        classification: 'preserve',
        createdBySource,
        storeId: seed.storeId,
        draftId: seed.draftId,
        reasons,
      };
    }
  }

  if (
    seed.isTestData ||
    isTestSourceReference(seed.normalized.sourceReference) ||
    isTestName(seed.normalized.businessName) ||
    createdBySource === 'mock_seed' ||
    createdBySource === 'qa_test' ||
    createdBySource === 'runtime_test' ||
    createdBySource === 'activation_test' ||
    (seed.verificationStatus === 'rejected' && !seed.storeId) ||
    (seed.verificationStatus === 'duplicate' && !seed.storeId)
  ) {
    reasons.push('test_seed_heuristic');
    return {
      id: seed.id,
      businessName: seed.normalized.businessName,
      verificationStatus: seed.verificationStatus,
      classification: linkedStore?.classification === 'preserve' ? 'preserve' : 'test_data',
      createdBySource,
      storeId: seed.storeId,
      draftId: seed.draftId,
      reasons,
    };
  }

  if (seed.verificationStatus === 'seeded_pending_qa') {
    reasons.push('pending_qa_review');
    return {
      id: seed.id,
      businessName: seed.normalized.businessName,
      verificationStatus: seed.verificationStatus,
      classification: 'review_required',
      createdBySource,
      storeId: seed.storeId,
      draftId: seed.draftId,
      reasons,
    };
  }

  if (seed.ownerUserId || seed.storeId || seed.verifiedAt || seed.activatedAt) {
    reasons.push('activation_path');
    return {
      id: seed.id,
      businessName: seed.normalized.businessName,
      verificationStatus: seed.verificationStatus,
      classification: 'preserve',
      createdBySource,
      storeId: seed.storeId,
      draftId: seed.draftId,
      reasons,
    };
  }

  reasons.push('default_review');
  return {
    id: seed.id,
    businessName: seed.normalized.businessName,
    verificationStatus: seed.verificationStatus,
    classification: 'review_required',
    createdBySource,
    storeId: seed.storeId,
    draftId: seed.draftId,
    reasons,
  };
}

export function classifyDraft(
  draft: DraftStoreRow,
  ctx: AuditContext,
  storeClassById: Map<string, ClassifiedStore>,
): ClassifiedDraft {
  const input = readJsonInput(draft.input);
  const createdBySource = inferCreatedBySource({ draftInput: input });
  const reasons: string[] = [];

  if (draft.committedStoreId) {
    const linked = storeClassById.get(draft.committedStoreId);
    if (linked?.classification === 'preserve') {
      reasons.push('committed_to_preserved_store');
      return {
        id: draft.id,
        status: draft.status,
        classification: 'preserve',
        createdBySource,
        committedStoreId: draft.committedStoreId,
        reasons,
      };
    }
  }

  if (
    draft.status === 'abandoned' ||
    draft.guestSessionId ||
    (draft.ownerUserId && isTestEmail(ctx.userEmailsById.get(draft.ownerUserId) ?? null)) ||
    createdBySource === 'mock_seed' ||
    createdBySource === 'qa_test' ||
    createdBySource === 'runtime_test'
  ) {
    reasons.push('test_draft_heuristic');
    return {
      id: draft.id,
      status: draft.status,
      classification: 'test_data',
      createdBySource,
      committedStoreId: draft.committedStoreId,
      reasons,
    };
  }

  if (draft.status === 'committed' || draft.committedStoreId) {
    reasons.push('committed_draft');
    return {
      id: draft.id,
      status: draft.status,
      classification: 'preserve',
      createdBySource,
      committedStoreId: draft.committedStoreId,
      reasons,
    };
  }

  reasons.push('uncommitted_review');
  return {
    id: draft.id,
    status: draft.status,
    classification: 'review_required',
    createdBySource,
    committedStoreId: draft.committedStoreId,
    reasons,
  };
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch {
    return fallback;
  }
}

async function listSeedSuitcases(dir: string): Promise<SeedSuitcase[]> {
  const suitcaseDir = path.join(dir, 'seedSuitcase');
  try {
    const files = await fs.readdir(suitcaseDir);
    const out: SeedSuitcase[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const parsed = await readJsonFile<SeedSuitcase>(path.join(suitcaseDir, f), null as unknown as SeedSuitcase);
      if (parsed?.seedId) out.push(parsed);
    }
    return out;
  } catch {
    return [];
  }
}

const AUDIT_SEEDS_FILE_FALLBACK_WARN =
  '[WARN] audit:seeds — DB unavailable, falling back to seeds.json (counts may not reflect Postgres state)';

/**
 * Load seed inventory from the same backend as import (`listSeedRecords`).
 * When the BusinessSeed DB backend is unavailable, fall back to seeds.json with an explicit WARN.
 * Read-path only — no writes / upserts / status changes.
 */
export async function loadAuditSeeds(): Promise<{
  seeds: IngestedSeedRecord[];
  seedSource: AuditSeedSource;
}> {
  const ingestionRepo = path.join(
    CORE_ROOT,
    'src',
    'lib',
    'businessIngestion',
    'IngestionRepository.ts',
  );
  const backendModPath = path.join(
    CORE_ROOT,
    'src',
    'lib',
    'businessIngestion',
    'businessSeedBackend.ts',
  );

  try {
    const [{ listSeedRecords }, { resolveBusinessSeedBackend }] = await Promise.all([
      import(pathToFileURL(ingestionRepo).href) as Promise<{
        listSeedRecords: () => Promise<IngestedSeedRecord[]>;
      }>,
      import(pathToFileURL(backendModPath).href) as Promise<{
        resolveBusinessSeedBackend: () => Promise<'db' | 'file'>;
      }>,
    ]);

    const backend = await resolveBusinessSeedBackend();
    if (backend === 'db') {
      const seeds = await listSeedRecords();
      return { seeds, seedSource: 'db' };
    }

    console.warn(AUDIT_SEEDS_FILE_FALLBACK_WARN);
    const seeds = await listSeedRecords();
    return { seeds, seedSource: 'file' };
  } catch (err) {
    console.warn(AUDIT_SEEDS_FILE_FALLBACK_WARN);
    console.warn(
      '[WARN] audit:seeds — backend resolve failed:',
      err instanceof Error ? err.message : String(err),
    );
    const seeds = await readJsonFile<IngestedSeedRecord[]>(
      path.join(ingestionDir(), 'seeds.json'),
      [],
    );
    return { seeds, seedSource: 'file' };
  }
}

export async function loadIngestionArtifacts(): Promise<{
  seeds: IngestedSeedRecord[];
  seedSource: AuditSeedSource;
  claims: IngestionClaimRequest[];
  enrichmentCandidates: EnrichmentCandidate[];
  suitcases: SeedSuitcase[];
}> {
  const dir = ingestionDir();
  const [seedLoad, claims, enrichmentCandidates, suitcases] = await Promise.all([
    loadAuditSeeds(),
    readJsonFile<IngestionClaimRequest[]>(path.join(dir, 'claims.json'), []),
    readJsonFile<EnrichmentCandidate[]>(path.join(dir, 'enrichment-candidates.json'), []),
    listSeedSuitcases(dir),
  ]);
  return {
    seeds: seedLoad.seeds,
    seedSource: seedLoad.seedSource,
    claims,
    enrichmentCandidates,
    suitcases,
  };
}

export async function loadAuditContext(prisma: PrismaClient): Promise<AuditContext> {
  const [
    businesses,
    drafts,
    users,
    devices,
    campaignPlans,
    missionRuns,
    workflowRuns,
    products,
    unclaimedStores,
    ingestion,
  ] = await Promise.all([
    prisma.business.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        userId: true,
        isActive: true,
        publishedAt: true,
        provenance: true,
        claimStatus: true,
        createdAt: true,
        email: true,
        user: { select: { id: true, email: true, role: true } },
      },
    }),
    prisma.draftStore.findMany({
      select: {
        id: true,
        status: true,
        mode: true,
        ownerUserId: true,
        guestSessionId: true,
        committedStoreId: true,
        createdAt: true,
        expiresAt: true,
        input: true,
      },
    }),
    prisma.user.findMany({ select: { id: true, email: true } }),
    prisma.device.findMany({ select: { storeId: true } }),
    prisma.campaignPlan.findMany({ select: { storeId: true } }),
    prisma.missionRun.findMany({ select: { storeId: true } }),
    prisma.workflowRun.findMany({ select: { draftStoreId: true } }),
    prisma.product.findMany({ select: { businessId: true } }),
    prisma.unclaimedStore.findMany({
      select: { id: true, slug: true, status: true, discoveryBatch: true },
    }),
    loadIngestionArtifacts(),
  ]);

  const userEmailsById = new Map(users.map((u) => [u.id, u.email]));
  const storeIdsWithDevices = new Set(devices.map((d) => d.storeId));
  const storeIdsWithCampaigns = new Set(
    campaignPlans.map((c) => c.storeId).filter((id): id is string => Boolean(id)),
  );
  const storeIdsWithMissions = new Set(
    missionRuns.map((m) => m.storeId).filter((id): id is string => Boolean(id)),
  );
  const draftIdsWithRuntime = new Set(
    workflowRuns.map((w) => w.draftStoreId).filter((id): id is string => Boolean(id)),
  );
  const storeIdsWithProducts = new Set(products.map((p) => p.businessId));

  const storeIdsWithRuntime = new Set<string>();
  for (const d of drafts) {
    if (d.committedStoreId && draftIdsWithRuntime.has(d.id)) {
      storeIdsWithRuntime.add(d.committedStoreId);
    }
  }
  for (const m of missionRuns) {
    if (m.storeId) storeIdsWithRuntime.add(m.storeId);
  }

  return {
    generatedAt: new Date().toISOString(),
    databaseUrlRedacted: redactDatabaseUrl(process.env.DATABASE_URL),
    ingestionDir: ingestionDir(),
    seedSource: ingestion.seedSource,
    businesses,
    drafts,
    seeds: ingestion.seeds,
    suitcases: ingestion.suitcases,
    enrichmentCandidates: ingestion.enrichmentCandidates,
    claims: ingestion.claims,
    unclaimedStores,
    storeIdsWithDevices,
    storeIdsWithCampaigns,
    storeIdsWithMissions,
    storeIdsWithRuntime,
    storeIdsWithProducts,
    userEmailsById,
    retiredSlugs: RETIRED_SLUGS,
  };
}

export function buildAuditReport(ctx: AuditContext): AuditReport {
  const seedByStoreId = new Map(
    ctx.seeds.filter((s) => s.storeId).map((s) => [s.storeId as string, s]),
  );

  const stores = ctx.businesses.map((b) => classifyBusiness(b, ctx, seedByStoreId));
  const storeClassById = new Map(stores.map((s) => [s.id, s]));
  const seeds = ctx.seeds.map((s) => classifySeed(s, ctx, storeClassById));
  const drafts = ctx.drafts.map((d) => classifyDraft(d, ctx, storeClassById));

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byCreatedBySource: Record<string, number> = {};
  const byCreatedAtDate: Record<string, number> = {};
  const byActivationState: Record<string, number> = {};

  for (const s of stores) {
    byStatus[s.storeStatus] = (byStatus[s.storeStatus] ?? 0) + 1;
    bySource[s.createdBySource] = (bySource[s.createdBySource] ?? 0) + 1;
    byCreatedBySource[s.createdBySource] = (byCreatedBySource[s.createdBySource] ?? 0) + 1;
    byActivationState[s.activationState] = (byActivationState[s.activationState] ?? 0) + 1;
    const biz = ctx.businesses.find((b) => b.id === s.id);
    if (biz) {
      const dk = dateKey(biz.createdAt);
      byCreatedAtDate[dk] = (byCreatedAtDate[dk] ?? 0) + 1;
    }
  }

  const byVerificationStatus: Record<string, number> = {};
  for (const s of ctx.seeds) {
    byVerificationStatus[s.verificationStatus] = (byVerificationStatus[s.verificationStatus] ?? 0) + 1;
  }

  const claimable = ctx.seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length;
  const claimed = ctx.seeds.filter((s) => Boolean(s.claimStartedAt)).length;
  const verified = ctx.seeds.filter(
    (s) => s.verificationStatus === 'verified_owner' || Boolean(s.verifiedAt),
  ).length;
  const activated = ctx.seeds.filter(
    (s) => s.verificationStatus === 'active' || Boolean(s.activatedAt),
  ).length;
  const rejected = ctx.seeds.filter((s) => s.verificationStatus === 'rejected').length;
  const operating = ctx.seeds.filter((s) => s.storeId && s.verificationStatus === 'active').length;
  const discovery = ctx.seeds.filter((s) => s.verificationStatus === 'seeded_pending_qa').length;

  const activationSuitcases = ctx.suitcases.filter((s) => s.activationNarrative).length;

  const preserveStores = stores.filter((s) => s.classification === 'preserve').length;
  const deleteCandidateStores = stores.filter((s) => s.classification === 'test_data').length;
  const reviewStores = stores.filter((s) => s.classification === 'review_required').length;
  const preserveSeeds = seeds.filter((s) => s.classification === 'preserve').length;
  const deleteCandidateSeeds = seeds.filter((s) => s.classification === 'test_data').length;
  const reviewSeeds = seeds.filter((s) => s.classification === 'review_required').length;
  const preserveDrafts = drafts.filter((d) => d.classification === 'preserve').length;
  const deleteCandidateDrafts = drafts.filter((d) => d.classification === 'test_data').length;
  const reviewDrafts = drafts.filter((d) => d.classification === 'review_required').length;

  return {
    context: ctx,
    stores,
    seeds,
    drafts,
    summary: {
      preserveStores,
      deleteCandidateStores,
      reviewStores,
      preserveSeeds,
      deleteCandidateSeeds,
      reviewSeeds,
      preserveDrafts,
      deleteCandidateDrafts,
      reviewDrafts,
    },
    storeBreakdown: {
      total: stores.length,
      byStatus,
      bySource,
      byCreatedBySource,
      byCreatedAtDate,
      byActivationState,
    },
    seedBreakdown: {
      total: ctx.seeds.length,
      claimable,
      claimed,
      verified,
      activated,
      rejected,
      byVerificationStatus,
    },
    biBreakdown: {
      snapshots: ctx.suitcases.filter((s) => s.biSnapshot).length,
      seedSuitcases: ctx.suitcases.length,
      activationSuitcases,
      enrichmentCandidates: ctx.enrichmentCandidates.length,
    },
    funnel: { discovery, claimable, claimed, verified, activated, operating },
    metricsRebuild: {
      controlCenter: {
        discoverySeeds: ctx.seeds.length,
        businesses: ctx.businesses.length,
        stores: stores.length,
        claims: ctx.claims.length,
        verificationPending: discovery,
        activated,
        operating,
        preservedStores: preserveStores,
        testCandidateStores: deleteCandidateStores,
      },
      businessIngestion: {
        totalSeeds: ctx.seeds.length,
        claimable,
        verified,
        active: activated,
        rejected,
        enrichmentCandidates: ctx.enrichmentCandidates.length,
        biSnapshots: ctx.suitcases.filter((s) => s.biSnapshot).length,
      },
    },
  };
}

export function buildCleanupPlan(report: AuditReport): CleanupPlan {
  const testSeedIds = new Set(report.seeds.filter((s) => s.classification === 'test_data').map((s) => s.id));
  const testStoreIds = new Set(report.stores.filter((s) => s.classification === 'test_data').map((s) => s.id));
  const testDraftIds = new Set(report.drafts.filter((d) => d.classification === 'test_data').map((d) => d.id));

  const enrichmentCandidateIds = report.context.enrichmentCandidates
    .filter((c) => testSeedIds.has(c.seedId))
    .map((c) => c.id);

  const seedIdsForSuitcaseRemoval = [...testSeedIds];
  const claimIds = report.context.claims.filter((c) => testSeedIds.has(c.seedId)).map((c) => c.id);
  const seedIds = [...testSeedIds];
  const draftIds = [...testDraftIds];
  const storeIds = [...testStoreIds];

  return {
    enrichmentCandidateIds,
    seedIdsForSuitcaseRemoval,
    claimIds,
    seedIds,
    draftIds,
    storeIds,
    rollback: {
      generatedAt: new Date().toISOString(),
      enrichmentCandidates: report.context.enrichmentCandidates.filter((c) =>
        enrichmentCandidateIds.includes(c.id),
      ),
      seeds: report.context.seeds.filter((s) => seedIds.includes(s.id)),
      suitcases: report.context.suitcases.filter((s) => seedIdsForSuitcaseRemoval.includes(s.seedId)),
      claims: report.context.claims.filter((c) => claimIds.includes(c.id)),
      stores: report.context.businesses.filter((b) => storeIds.includes(b.id)),
      drafts: report.context.drafts.filter((d) => draftIds.includes(d.id)),
    },
  };
}

export async function tagTestRecords(
  report: AuditReport,
  batchId = 'melbourne-batch0-prep',
): Promise<{ storesTagged: number; seedsTagged: number; snapshotsTagged: number }> {
  const dir = ingestionDir();
  await fs.mkdir(dir, { recursive: true });

  const testSeedIds = new Set(report.seeds.filter((s) => s.classification === 'test_data').map((s) => s.id));
  const testStoreIds = new Set(report.stores.filter((s) => s.classification === 'test_data').map((s) => s.id));
  const testDraftIds = new Set(report.drafts.filter((d) => d.classification === 'test_data').map((d) => d.id));

  const seedsPath = path.join(dir, 'seeds.json');
  const seeds = await readJsonFile<IngestedSeedRecord[]>(seedsPath, []);
  let seedsTagged = 0;
  const updatedSeeds = seeds.map((seed) => {
    if (!testSeedIds.has(seed.id)) return seed;
    seedsTagged += 1;
    const classified = report.seeds.find((s) => s.id === seed.id);
    return {
      ...seed,
      isTestData: true,
      testBatchId: batchId,
      createdBySource: classified?.createdBySource ?? 'qa_test',
    };
  });
  await fs.writeFile(seedsPath, JSON.stringify(updatedSeeds, null, 2), 'utf8');

  const tags = {
    generatedAt: new Date().toISOString(),
    testBatchId: batchId,
    stores: Object.fromEntries(
      [...testStoreIds].map((id) => {
        const row = report.stores.find((s) => s.id === id);
        return [
          id,
          {
            isTestData: true,
            testBatchId: batchId,
            createdBySource: row?.createdBySource ?? 'qa_test',
          },
        ];
      }),
    ),
    drafts: Object.fromEntries(
      [...testDraftIds].map((id) => {
        const row = report.drafts.find((d) => d.id === id);
        return [
          id,
          {
            isTestData: true,
            testBatchId: batchId,
            createdBySource: row?.createdBySource ?? 'qa_test',
          },
        ];
      }),
    ),
  };
  await fs.writeFile(testTagsFile(), JSON.stringify(tags, null, 2), 'utf8');

  const snapshotsTagged = report.context.suitcases.filter(
    (s) => testSeedIds.has(s.seedId) && s.biSnapshot,
  ).length;

  return {
    storesTagged: testStoreIds.size,
    seedsTagged,
    snapshotsTagged,
  };
}

async function deleteTestStore(tx: PrismaClient, storeId: string): Promise<void> {
  const client = tx as unknown as {
    promotionPlacement: { deleteMany: (args: unknown) => Promise<unknown> };
    promotion: { deleteMany: (args: unknown) => Promise<unknown> };
    smartObject: { deleteMany: (args: unknown) => Promise<unknown> };
    intentOpportunity: { deleteMany: (args: unknown) => Promise<unknown> };
    intentSignal: { deleteMany: (args: unknown) => Promise<unknown> };
    storeOffer: { deleteMany: (args: unknown) => Promise<unknown> };
    storePromo: { deleteMany: (args: unknown) => Promise<unknown> };
    product: { deleteMany: (args: unknown) => Promise<unknown> };
    business: { delete: (args: unknown) => Promise<unknown> };
    draftStore: { deleteMany: (args: unknown) => Promise<unknown> };
  };

  await client.promotionPlacement.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.promotion.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.smartObject.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.intentOpportunity.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.intentSignal.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.storeOffer.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.storePromo.deleteMany({ where: { storeId } }).catch(() => undefined);
  await client.product.deleteMany({ where: { businessId: storeId } }).catch(() => undefined);
  await client.business.delete({ where: { id: storeId } });
}

export async function executeCleanupPlan(
  prisma: PrismaClient,
  plan: CleanupPlan,
  options: { apply: boolean; rollbackPath?: string },
): Promise<void> {
  if (options.rollbackPath) {
    await fs.mkdir(path.dirname(options.rollbackPath), { recursive: true });
    await fs.writeFile(options.rollbackPath, JSON.stringify(plan.rollback, null, 2), 'utf8');
  }

  if (!options.apply) return;

  const dir = ingestionDir();

  // 1–5: JSON artifacts (file-level transaction via backup already in rollback)
  const candidatesPath = path.join(dir, 'enrichment-candidates.json');
  const allCandidates = await readJsonFile<EnrichmentCandidate[]>(candidatesPath, []);
  const removeCandidateIds = new Set(plan.enrichmentCandidateIds);
  await fs.writeFile(
    candidatesPath,
    JSON.stringify(allCandidates.filter((c) => !removeCandidateIds.has(c.id)), null, 2),
    'utf8',
  );

  for (const seedId of plan.seedIdsForSuitcaseRemoval) {
    const suitcasePath = path.join(dir, 'seedSuitcase', `${seedId}.json`);
    await fs.unlink(suitcasePath).catch(() => undefined);
  }

  const claimsPath = path.join(dir, 'claims.json');
  const allClaims = await readJsonFile<IngestionClaimRequest[]>(claimsPath, []);
  const removeClaimIds = new Set(plan.claimIds);
  await fs.writeFile(
    claimsPath,
    JSON.stringify(allClaims.filter((c) => !removeClaimIds.has(c.id)), null, 2),
    'utf8',
  );

  const seedsPath = path.join(dir, 'seeds.json');
  const allSeeds = await readJsonFile<IngestedSeedRecord[]>(seedsPath, []);
  const removeSeedIds = new Set(plan.seedIds);
  await fs.writeFile(
    seedsPath,
    JSON.stringify(allSeeds.filter((s) => !removeSeedIds.has(s.id)), null, 2),
    'utf8',
  );

  // 6–7: Prisma deletes in one transaction
  await prisma.$transaction(async (tx) => {
    if (plan.draftIds.length) {
      await tx.draftStore.deleteMany({ where: { id: { in: plan.draftIds } } });
    }
    for (const storeId of plan.storeIds) {
      await deleteTestStore(tx as unknown as PrismaClient, storeId);
    }
  });
}

function bulletCounts(map: Record<string, number>): string {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

export function formatAuditReportMarkdown(report: AuditReport): string {
  const { summary, storeBreakdown, seedBreakdown, biBreakdown, funnel, metricsRebuild, context } =
    report;

  const preserveStores = report.stores.filter((s) => s.classification === 'preserve');
  const runtimePreserve = preserveStores.filter(
    (s) =>
      s.preserveFlags.hasMissions ||
      s.preserveFlags.hasRuntimeHistory ||
      s.preserveFlags.hasCampaigns ||
      s.preserveFlags.hasDevices,
  );

  const seedSourceLine =
    context.seedSource === 'db'
      ? 'Seed source: **db** (`BusinessSeed` / same backend as import)'
      : 'Seed source: **file** (`seeds.json`) — WARNING: counts may not reflect Postgres state';

  return `# Discovery Data Audit

Generated: ${context.generatedAt}  
Database: ${context.databaseUrlRedacted}  
Ingestion dir: \`${context.ingestionDir}\`  
${seedSourceLine}

---

## Store Audit

Total Stores: **${storeBreakdown.total}**

### By Status

${bulletCounts(storeBreakdown.byStatus)}

### By Source (createdBySource)

${bulletCounts(storeBreakdown.byCreatedBySource)}

### By Creation Date

${bulletCounts(storeBreakdown.byCreatedAtDate)}

### By Activation State

${bulletCounts(storeBreakdown.byActivationState)}

---

## Discovery Seed Breakdown

Total BusinessSeeds: **${seedBreakdown.total}**

| Stage | Count |
|-------|------:|
| Claimable | ${seedBreakdown.claimable} |
| Claimed (claim started) | ${seedBreakdown.claimed} |
| Verified | ${seedBreakdown.verified} |
| Activated | ${seedBreakdown.activated} |
| Rejected | ${seedBreakdown.rejected} |

### By verificationStatus

${bulletCounts(seedBreakdown.byVerificationStatus)}

---

## BI Snapshot Breakdown

| Artifact | Count |
|----------|------:|
| BusinessIntelligenceSnapshot | ${biBreakdown.snapshots} |
| SeedSuitcase | ${biBreakdown.seedSuitcases} |
| Activation Suitcase (narrative) | ${biBreakdown.activationSuitcases} |
| Enrichment Candidates | ${biBreakdown.enrichmentCandidates} |

---

## Runtime Impact Report (PRESERVE)

Stores with runtime/platform footprint: **${runtimePreserve.length}**

${runtimePreserve
  .slice(0, 50)
  .map(
    (s) =>
      `- **${s.slug}** (${s.name}) — missions:${s.preserveFlags.hasMissions} campaigns:${s.preserveFlags.hasCampaigns} devices:${s.preserveFlags.hasDevices} runtime:${s.preserveFlags.hasRuntimeHistory}`,
  )
  .join('\n')}

${runtimePreserve.length > 50 ? `\n_…and ${runtimePreserve.length - 50} more preserved stores._\n` : ''}

---

## Classification Summary

| Bucket | Stores | Seeds | Drafts |
|--------|-------:|------:|-------:|
| **PRESERVE** | ${summary.preserveStores} | ${summary.preserveSeeds} | ${summary.preserveDrafts} |
| **Delete Candidates (TEST DATA)** | ${summary.deleteCandidateStores} | ${summary.deleteCandidateSeeds} | ${summary.deleteCandidateDrafts} |
| **Review Required** | ${summary.reviewStores} | ${summary.reviewSeeds} | ${summary.reviewDrafts} |

**NO deletion performed.** Review this report before running cleanup.

---

## Funnel Baseline

\`\`\`
Discovery (${funnel.discovery})
  ↓
Claimable (${funnel.claimable})
  ↓
Claimed (${funnel.claimed})
  ↓
Verified (${funnel.verified})
  ↓
Activated (${funnel.activated})
  ↓
Operating (${funnel.operating})
\`\`\`

---

## Metrics Rebuild Preview

### Control Center

${Object.entries(metricsRebuild.controlCenter)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

### Business Ingestion

${Object.entries(metricsRebuild.businessIngestion)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
`;
}

export function formatDryRunMarkdown(plan: CleanupPlan): string {
  return `# Discovery Cleanup — Dry Run

Generated: ${plan.rollback.generatedAt}

**No mutations performed.**

## Would delete

| Entity | Count |
|--------|------:|
| Stores | ${plan.storeIds.length} |
| DraftStores | ${plan.draftIds.length} |
| BusinessSeeds | ${plan.seedIds.length} |
| BI Snapshots / SeedSuitcases | ${plan.seedIdsForSuitcaseRemoval.length} |
| Enrichment Candidates | ${plan.enrichmentCandidateIds.length} |
| Activation Records (claims) | ${plan.claimIds.length} |

### Store IDs

${plan.storeIds.map((id) => `- ${id}`).join('\n') || '_none_'}

### Seed IDs

${plan.seedIds.map((id) => `- ${id}`).join('\n') || '_none_'}

### Draft IDs

${plan.draftIds.map((id) => `- ${id}`).join('\n') || '_none_'}
`;
}

export function formatReadinessMarkdown(report: AuditReport): string {
  const isStaging =
    Boolean(process.env.RENDER_EXTERNAL_URL) ||
    Boolean(process.env.RENDER_SERVICE_ID) ||
    String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';

  const hasReview =
    report.summary.reviewStores > 0 ||
    report.summary.reviewSeeds > 0 ||
    report.summary.reviewDrafts > 0;

  const hasDeleteCandidates =
    report.summary.deleteCandidateStores +
      report.summary.deleteCandidateSeeds +
      report.summary.deleteCandidateDrafts >
    0;

  let recommendation: string;
  if (hasReview) {
    recommendation =
      '**NO-GO** — Review-required records remain. Resolve ambiguous stores/seeds before Melbourne Batch 0.';
  } else if (!isStaging && !process.env.STAGING_DATABASE_URL) {
    recommendation =
      '**NO-GO** — Audit was run against a non-staging database. Re-run on staging (`DATABASE_URL` / Render shell) before launch.';
  } else if (hasDeleteCandidates) {
    recommendation =
      '**CONDITIONAL GO** — Test data identified with zero review-required rows. Proceed only after human sign-off on dry-run deletion counts.';
  } else {
    recommendation =
      '**GO** — No test delete candidates and no review-required rows. Staging metrics reflect preserved platform data.';
  }

  return `# Melbourne Batch 0 Readiness

Generated: ${report.context.generatedAt}

Seed source: ${
    report.context.seedSource === 'db'
      ? 'db (BusinessSeed)'
      : 'file (seeds.json) — WARNING: may not reflect Postgres'
  }

## Remaining inventory

| Metric | Count |
|--------|------:|
| Real stores (PRESERVE) | ${report.summary.preserveStores} |
| Discovery seeds (PRESERVE) | ${report.summary.preserveSeeds} |
| Activated businesses (funnel) | ${report.funnel.activated} |
| Operating businesses | ${report.funnel.operating} |
| BI snapshots | ${report.biBreakdown.snapshots} |
| Delete candidates (stores) | ${report.summary.deleteCandidateStores} |
| Delete candidates (seeds) | ${report.summary.deleteCandidateSeeds} |
| Review required (stores) | ${report.summary.reviewStores} |
| Review required (seeds) | ${report.summary.reviewSeeds} |

## Funnel baseline

\`\`\`
Discovery (${report.funnel.discovery})
  ↓
Claimable (${report.funnel.claimable})
  ↓
Claimed (${report.funnel.claimed})
  ↓
Verified (${report.funnel.verified})
  ↓
Activated (${report.funnel.activated})
  ↓
Operating (${report.funnel.operating})
\`\`\`

## Recommendation

${recommendation}

## Next steps

1. Review \`docs/reports/DISCOVERY_DATA_AUDIT_*.md\`
2. Run \`pnpm cleanup:discovery:dry-run\`
3. Optional: \`pnpm cleanup:discovery -- --tag-only\` to mark test metadata
4. After explicit approval: \`pnpm cleanup:discovery -- --apply\`
5. Re-run audit to refresh metrics

**Do not launch Melbourne Batch 0 until review-required count is zero and cleanup is approved.**
`;
}

export async function ensureCoreEnv(): Promise<void> {
  const envPath = path.join(CORE_ROOT, 'src', 'env', 'ensureDatabaseUrl.js');
  await import(pathToFileURL(envPath).href);
}

export async function getCorePrisma(): Promise<PrismaClient> {
  const prismaPath = path.join(CORE_ROOT, 'src', 'lib', 'prisma.js');
  const mod = (await import(pathToFileURL(prismaPath).href)) as {
    getPrismaClient: () => PrismaClient;
  };
  return mod.getPrismaClient();
}

export function reportsDir(): string {
  return path.join(REPO_ROOT, 'docs', 'reports');
}

export async function writeReportFile(prefix: string, content: string): Promise<string> {
  const dir = reportsDir();
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${prefix}_${stamp}.md`);
  await fs.writeFile(file, content, 'utf8');
  return file;
}
