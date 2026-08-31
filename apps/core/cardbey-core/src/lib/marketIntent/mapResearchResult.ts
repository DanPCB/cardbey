import type { KnowledgeBasis, MarketEntityResearch, MarketOfferingItem, ResolvedMarketEntity } from './entityTypes.js';

function basisFromConfidence(confidence: number, sourceType?: string | null): KnowledgeBasis {
  if (!confidence || confidence < 0.35) return 'UNKNOWN';
  if (confidence >= 0.7 && sourceType && /official_website|google_business|manual/.test(sourceType)) {
    return 'FACT';
  }
  if (confidence >= 0.55) return 'INFERENCE';
  return 'UNKNOWN';
}

function attributedValue(value: unknown): { text: string | null; confidence: number; sourceType: string | null; sourceUrl: string | null } {
  if (value == null) {
    return { text: null, confidence: 0, sourceType: null, sourceUrl: null };
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const v = value as { value?: unknown; confidence?: number; sourceType?: string; sourceUrl?: string };
    return {
      text: v.value != null ? String(v.value) : null,
      confidence: typeof v.confidence === 'number' ? v.confidence : 0.5,
      sourceType: v.sourceType ?? null,
      sourceUrl: v.sourceUrl ?? null,
    };
  }
  return { text: String(value), confidence: 0.5, sourceType: null, sourceUrl: null };
}

/**
 * Map existing BusinessResearchResult → neutral MarketEntityResearch (no duplication of agent).
 */
export function mapBusinessResearchToMarketEntityResearch(
  resolved: ResolvedMarketEntity,
  /** @type {import('../storeCreationResearch/types.js').BusinessResearchResult} */
  result: Record<string, unknown>,
  researchCacheKey?: string | null,
): MarketEntityResearch {
  const facts = (result.facts as Record<string, unknown> | null) ?? null;
  const limitations: string[] = [];

  const name = facts ? attributedValue(facts.businessName) : { text: resolved.canonicalName, confidence: resolved.confidence, sourceType: null, sourceUrl: null };
  const category = facts ? attributedValue(facts.category) : { text: null, confidence: 0, sourceType: null, sourceUrl: null };
  const description = facts ? attributedValue(facts.description) : { text: null, confidence: 0, sourceType: null, sourceUrl: null };
  const website = facts ? attributedValue(facts.website) : { text: resolved.website, confidence: 0.5, sourceType: null, sourceUrl: null };
  const address = facts ? attributedValue(facts.address) : { text: resolved.location, confidence: 0.5, sourceType: null, sourceUrl: null };
  const phone = facts ? attributedValue(facts.phone) : { text: null, confidence: 0, sourceType: null, sourceUrl: null };
  const email = facts ? attributedValue(facts.email) : { text: null, confidence: 0, sourceType: null, sourceUrl: null };

  const offerings: MarketOfferingItem[] = [];
  const itemSources = [
    ...(Array.isArray(result.extractedItems) ? result.extractedItems : []),
    ...(Array.isArray(facts?.services) ? facts.services : []),
    ...(Array.isArray(facts?.products) ? facts.products : []),
    ...(Array.isArray(facts?.menuItems) ? facts.menuItems : []),
  ];

  const seen = new Set<string>();
  for (const raw of itemSources) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const nameKey = String(item.name ?? '').trim().toLowerCase();
    if (!nameKey || seen.has(nameKey)) continue;
    seen.add(nameKey);
    const conf = typeof item.confidence === 'number' ? item.confidence : 0.6;
    offerings.push({
      name: String(item.name),
      description: item.description != null ? String(item.description) : null,
      category: item.category != null ? String(item.category) : null,
      price: typeof item.price === 'number' ? item.price : null,
      currency: item.currency != null ? String(item.currency) : null,
      basis: basisFromConfidence(conf, item.sourceType as string | null),
      confidence: conf,
      sourceUrl: item.sourceUrl != null ? String(item.sourceUrl) : null,
      evidence: [
        {
          statement: `Offering extracted from research source`,
          basis: basisFromConfidence(conf, item.sourceType as string | null),
          confidence: conf,
          source: item.sourceType != null ? String(item.sourceType) : null,
        },
      ],
    });
  }

  const geographies: string[] = [];
  if (address.text) geographies.push(address.text);

  const socialProfiles: Array<{ platform: string; url: string }> = [...resolved.socialProfiles];
  if (facts?.socialLinks && typeof facts.socialLinks === 'object') {
    for (const [platform, val] of Object.entries(facts.socialLinks as Record<string, unknown>)) {
      const av = attributedValue(val);
      if (av.text) socialProfiles.push({ platform, url: av.text });
    }
  }

  const publicContacts: MarketEntityResearch['publicContacts'] = [];
  if (phone.text) {
    publicContacts.push({
      type: 'phone',
      value: phone.text,
      basis: basisFromConfidence(phone.confidence, phone.sourceType),
      confidence: phone.confidence,
    });
  }
  if (email.text) {
    publicContacts.push({
      type: 'email',
      value: email.text,
      basis: basisFromConfidence(email.confidence, email.sourceType),
      confidence: email.confidence,
    });
  }

  const confidence = typeof result.confidence === 'number' ? result.confidence : resolved.confidence;
  if (result.fallbackToGenerated) limitations.push('Research fell back — limited sourced evidence');
  if (result.ownerReviewRequired) limitations.push('Owner review would be required before publish use');
  if (!offerings.length) limitations.push('No offerings reconstructed — quality gate not met');

  const researchStatus =
    confidence >= 0.55 && (offerings.length > 0 || name.text)
      ? 'READY'
      : confidence > 0
        ? 'INSUFFICIENT_EVIDENCE'
        : 'FAILED';

  const evidence = [
    ...resolved.evidence,
    ...(name.text
      ? [
          {
            statement: `Business identity: ${name.text}`,
            basis: basisFromConfidence(name.confidence, name.sourceType) as KnowledgeBasis,
            confidence: name.confidence,
            source: name.sourceType,
          },
        ]
      : []),
    ...(description.text
      ? [
          {
            statement: description.text.slice(0, 200),
            basis: basisFromConfidence(description.confidence, description.sourceType) as KnowledgeBasis,
            confidence: description.confidence,
            source: description.sourceType,
          },
        ]
      : []),
  ];

  const businessProfile = result.businessProfile as Record<string, unknown> | null;

  return {
    signalId: resolved.signalId,
    resolvedEntityRef: resolved.resolvedEntityRef,
    businessIdentity: name.text,
    businessType: category.text ?? (businessProfile?.semanticType != null ? String(businessProfile.semanticType) : null),
    summary: description.text,
    offerings,
    capabilities: category.text ? [category.text] : [],
    geographies,
    customerSegments: [],
    digitalPresence: {
      website: website.text ?? resolved.website,
      socialProfiles,
    },
    publicContacts,
    evidence,
    confidence,
    researchStatus,
    limitations,
    researchedAt: new Date().toISOString(),
    researchCacheKey: researchCacheKey ?? null,
  };
}
