/**
 * Store Knowledge Projection (SKP) — canonical unified view of a Cardbey store.
 *
 * FIELD MAP (2026-08-25 diagnostic — real Core schema, not prompt stubs)
 * -----------------------------------------------------------------------
 * Business (prisma model Business):
 *   id, userId, name, type, slug, description, tagline, heroText,
 *   logo, region, isActive, tradingHours, address, addressLine2, suburb,
 *   city, state, postcode, country, formattedAddress, locationSource,
 *   locationConfidence, osmPlaceId, phone, email, websiteUrl, mapUrl,
 *   lat, lng, primaryColor, secondaryColor, heroImageUrl, avatarImageUrl,
 *   publishedAt, transactionMode, catalogLabel, ctaLabel, stylePreferences,
 *   storefrontSettings, socialLinks, brandTone, brandStyle, brandColors,
 *   provenance ("owner" | "consumer_capture"), claimStatus, captureCount,
 *   publishedArtifactProjection relation
 *
 * PublishedArtifactProjection:
 *   id, businessId, tenantId, storeId, slug, version, projectionJson,
 *   heroVideoUrl, heroMediaType, sourceDraftId, publishRunId
 *   projectionJson ≈ PublishedBusinessArtifact v1
 *     { name, slug, hero, content{description,tagline}, website{sections,theme},
 *       commerce{products}, category, publishedAt, … }
 *
 * Public DTO today: utils/publicStoreMapper.js → toPublicStore(business)
 *   + publishedBusinessArtifactToPublicStore(projection) when artifact exists
 *   Served by GET /api/public/stores/:slug (routes/publicUsers.js)
 *
 * Mission 001: lib/mission001/* — draft/create path; provenanceStatus
 *   REAL|INFERRED|GENERATED|UNKNOWN on catalog items (not public feed)
 *
 * BOI: lib/businessOperationIntelligence/* — transient snapshots;
 *   knowledgeStates USER_DEFINED|DISCOVERED_FACT|AI_INFERENCE|…
 *   Routes not mounted in server.js (Phase 4)
 *
 * PIL: reads store context via public/performer surfaces — not a knowledge store
 *
 * Rule: Phase 1 SKP is READ-ONLY. No writes to Business / User / seed tables.
 * Downstream (SSR, attribution, Performer, Virtual KOL) must consume SKP —
 * they must not invent a parallel knowledge base.
 */

/**
 * @typedef {import('./provenance.js').ProvenanceTag} ProvenanceTagUnused
 * @typedef {{ value: any, provenance: string, source?: string, confidence: number, updatedAt: string }} ProvenancedField
 *
 * @typedef {object} SkpIdentity
 * @property {string} storeId
 * @property {string} slug
 * @property {ProvenancedField} businessName
 * @property {ProvenancedField} legalName
 * @property {ProvenancedField} abn
 *
 * @typedef {object} SkpLocation
 * @property {ProvenancedField} suburb
 * @property {ProvenancedField} state
 * @property {ProvenancedField} country
 * @property {ProvenancedField} address
 * @property {ProvenancedField} coordinates
 *
 * @typedef {object} SkpClassification
 * @property {ProvenancedField} category
 * @property {ProvenancedField} subCategory
 * @property {ProvenancedField} tags
 * @property {ProvenancedField} cuisineTags
 * @property {ProvenancedField} industryCode
 *
 * @typedef {object} SkpContent
 * @property {ProvenancedField} tagline
 * @property {ProvenancedField} description
 * @property {ProvenancedField} heroImageUrl
 * @property {ProvenancedField} logoUrl
 * @property {ProvenancedField} heroVideoUrl
 *
 * @typedef {object} SkpContact
 * @property {ProvenancedField} phone
 * @property {ProvenancedField} email
 * @property {ProvenancedField} website
 * @property {ProvenancedField} socialLinks
 *
 * @typedef {object} SkpCommerce
 * @property {ProvenancedField} openingHours
 * @property {ProvenancedField} priceRange
 * @property {ProvenancedField} acceptsBookings
 * @property {ProvenancedField} acceptsOnlineOrders
 * @property {ProvenancedField} catalogItemCount
 * @property {ProvenancedField} activeCampaignCount
 *
 * @typedef {object} SkpIntelligence
 * @property {ProvenancedField} biSummary
 * @property {ProvenancedField} performerInsights
 * @property {'ENRICHED'|'PARTIAL'|'UNENRICHED'} enrichmentStatus
 * @property {string[]} enrichmentSources
 * @property {string|null} lastEnrichedAt
 *
 * @typedef {object} SkpVisibility
 * @property {string} canonicalUrl
 * @property {boolean} indexable
 * @property {boolean} jsonLdReady
 * @property {boolean} sitemapIncluded
 * @property {boolean} aiSearchReady
 *
 * @typedef {object} StoreKnowledgeProjection
 * @property {SkpIdentity} identity
 * @property {SkpLocation} location
 * @property {SkpClassification} classification
 * @property {SkpContent} content
 * @property {SkpContact} contact
 * @property {SkpCommerce} commerce
 * @property {SkpIntelligence} intelligence
 * @property {SkpVisibility} visibility
 * @property {string} generatedAt
 * @property {number} version
 */

export const SKP_VERSION = 1;

/**
 * Resolve SKP visibility flags from crawlability + feature gates.
 * aiSearchReady requires Phase 2 crawlable SKP + Phase 3 attributionV1.
 * @param {{ indexable: boolean, jsonLdReady: boolean, attributionEnabled?: boolean }} args
 */
export function resolveSkpVisibilityFlags({
  indexable,
  jsonLdReady,
  attributionEnabled = false,
}) {
  const canIndex = Boolean(indexable);
  const ld = Boolean(jsonLdReady);
  return {
    sitemapIncluded: canIndex, // Phase 2: published stores in sitemap-stores.xml
    aiSearchReady: Boolean(canIndex && ld && attributionEnabled),
  };
}

/** @deprecated Prefer resolveSkpVisibilityFlags — kept for callers that need defaults. */
export function initialSkpVisibilityFlags() {
  return resolveSkpVisibilityFlags({
    indexable: false,
    jsonLdReady: false,
    attributionEnabled: false,
  });
}
