/**
 * Business Discovery / Ingestion Layer — shared types (Phase 1).
 *
 * These types describe candidates surfaced from PERMITTED public sources only
 * (official APIs, user-supplied URLs, uploaded materials, manual input, schema.org).
 * External data is NEVER treated as owner-confirmed — see businessClaimStatus.ts.
 */

export type ClaimStatus = 'unclaimed' | 'pending_verification' | 'claimed';

/**
 * Where a candidate's facts came from. Used for attribution + ethics.
 * - google_places: official Google Places API (only when configured)
 * - website: extraction from a user-supplied website URL
 * - schema_org: structured data (schema.org / JSON-LD) parsed from a supplied page
 * - social: social links supplied by the user
 * - upload: uploaded menu / business card / photo (OCR)
 * - manual: typed directly by the user
 * - apple_maps | yelp | facebook_page: future permitted sources
 */
export type DiscoverySource =
  | 'google_places'
  | 'website'
  | 'schema_org'
  | 'social'
  | 'upload'
  | 'manual'
  | 'apple_maps'
  | 'yelp'
  | 'facebook_page';

export interface OpeningHours {
  /** Free-form, human-readable lines, e.g. "Mon–Fri 9am–5pm". */
  readonly lines?: string[];
  /** Optional raw payload from the source (e.g. Places periods). */
  readonly raw?: unknown;
}

export interface SourceAttribution {
  readonly source: DiscoverySource;
  readonly sourceUrl: string | null;
  /** External provider id, e.g. Google place_id. */
  readonly sourceId?: string | null;
  /** ISO timestamp when this fact set was fetched. */
  readonly fetchedAt: string;
  /** Provider attribution / license note required for display. */
  readonly attributionText?: string | null;
}

/**
 * The canonical shape requested in the spec. A single discovered/normalized business.
 */
export interface BusinessDiscoveryCandidate {
  /** Stable id for this candidate within Cardbey's discovery store. */
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  openingHours: OpeningHours | null;
  photos: string[];
  rating: number | null;
  reviewCount: number | null;
  /** Primary source label (kept for the spec's flat shape). */
  source: DiscoverySource;
  sourceUrl: string | null;
  /** 0..1 confidence that this is a real, correctly-resolved business. */
  confidence: number;
  claimStatus: ClaimStatus;

  // --- Cardbey bookkeeping (additive to the spec's flat shape) ---
  /** Full attribution chain (a candidate may merge facts from several sources). */
  attributions: SourceAttribution[];
  /** Geo, when available. */
  location: { lat: number | null; lng: number | null; raw: string | null } | null;
  /** Social links supplied by the user or extracted. */
  socialLinks: Record<string, string> | null;
  /** Dedup fingerprint (name+phone+location+website). */
  dedupeKey: string;
  /** True once a record exists in the discovery store (imported as draft/unclaimed). */
  imported: boolean;
  /** Cardbey user who claimed it (null until claimed). */
  claimedByUserId: string | null;
  /** Cardbey store/channel id once generated. */
  generatedStoreId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input accepted by the search endpoint. */
export interface DiscoverySearchInput {
  q: string;
  location?: string | null;
}

/** Input accepted by the import endpoint. */
export interface DiscoveryImportInput {
  /** Either reference a previously-searched candidate id... */
  candidateId?: string | null;
  /** ...or supply raw fields directly (manual / social / website / upload). */
  name?: string | null;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  source?: DiscoverySource | null;
  sourceUrl?: string | null;
  socialLinks?: Record<string, string> | null;
  photos?: string[] | null;
  openingHours?: OpeningHours | null;
  rating?: number | null;
  reviewCount?: number | null;
  /** When provided, treated as an authoritative confidence override (0..1). */
  confidence?: number | null;
}

export const MIN_CONFIDENCE_FOR_NON_DRAFT = 0.6;
