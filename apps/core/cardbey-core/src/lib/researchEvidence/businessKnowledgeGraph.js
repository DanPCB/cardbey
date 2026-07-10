import { mergeEvidence } from './evidenceMerger.js';
import { OWNER_VERIFIED_STATUS } from './providerTypes.js';

function nowIso() {
  return new Date().toISOString();
}

function buildMeta(entry, fallbackTier = 7) {
  return {
    sourceEvidenceIds: Array.isArray(entry?.sourceEvidenceIds) ? entry.sourceEvidenceIds : [],
    confidence: typeof entry?.confidence === 'number' ? entry.confidence : 0,
    tier: typeof entry?.tier === 'number' ? entry.tier : fallbackTier,
    ownerVerifiedStatus: entry?.ownerVerifiedStatus ?? OWNER_VERIFIED_STATUS.PENDING,
    lastUpdatedAt: nowIso(),
    conflict: Boolean(entry?.conflict),
    conflictEvidenceIds: Array.isArray(entry?.conflictingValues)
      ? entry.conflictingValues.flatMap((row) => row.evidenceIds ?? [])
      : [],
    providerIds: entry?.providerId ? [entry.providerId] : [],
  };
}

function buildListNodes(items = []) {
  return items.map((item, index) => ({
    id: item.id ?? `node_${index}`,
    name: item.name ?? item.title ?? null,
    description: item.description ?? null,
    price: item.price ?? null,
    durationMinutes: item.durationMinutes ?? null,
    category: item.category ?? null,
    executionAction: item.executionAction ?? null,
    serviceMode: item.serviceMode ?? null,
    meta: buildMeta(item, item.tier),
  }));
}

export function buildBusinessKnowledgeGraph({ providerResults = [], businessProfile = null, catalog = null } = {}) {
  const merged = mergeEvidence(providerResults);
  const facts = merged.mergedFacts;
  const services = buildListNodes(
    merged.catalogItems.filter((item) => !/menu|food|drink|dish/i.test(String(item.category ?? ''))),
  );
  const menuItems = buildListNodes(
    merged.catalogItems.filter((item) => /menu|food|drink|dish/i.test(String(item.category ?? ''))),
  );

  return {
    businessIdentity: {
      businessName: facts.businessName?.value ?? null,
      category: facts.category?.value ?? businessProfile?.businessType ?? null,
      description: facts.description?.value ?? null,
      meta: buildMeta(facts.businessName ?? facts.category ?? {}),
    },
    locations: facts.address?.value ? [{ address: facts.address.value, meta: buildMeta(facts.address) }] : [],
    contacts: [
      facts.phone?.value ? { type: 'phone', value: facts.phone.value, meta: buildMeta(facts.phone) } : null,
      facts.email?.value ? { type: 'email', value: facts.email.value, meta: buildMeta(facts.email) } : null,
      facts.website?.value ? { type: 'website', value: facts.website.value, meta: buildMeta(facts.website) } : null,
    ].filter(Boolean),
    openingHours: facts.openingHours?.value ? [{ value: facts.openingHours.value, meta: buildMeta(facts.openingHours) }] : [],
    services,
    products: [],
    menuItems,
    staff: [],
    mediaAssets: providerResults.flatMap((row) => row.mediaAssets ?? []),
    reviewsSummary: facts.reviewsSummary?.value ?? null,
    socialChannels: [],
    policies: [],
    promotions: [],
    serviceAreas: [],
    certifications: [],
    FAQs: [],
    evidenceIndex: providerResults.flatMap((row) => row.sourceEvidence ?? []),
    confidenceSummary: merged.confidenceSummary,
    ownerVerification: {
      status: merged.conflicts.length ? OWNER_VERIFIED_STATUS.NEEDS_OWNER_REVIEW : OWNER_VERIFIED_STATUS.PENDING,
      conflicts: merged.conflicts,
      ownerReviewRequired: merged.conflicts.length > 0 || providerResults.some((row) => row.sourceType === 'ai_generated'),
    },
    legacyCatalogPreview: {
      itemCount: Array.isArray(catalog?.products) ? catalog.products.length : 0,
      businessType: businessProfile?.businessType ?? null,
      catalogMode: businessProfile?.catalogMode ?? null,
    },
  };
}
