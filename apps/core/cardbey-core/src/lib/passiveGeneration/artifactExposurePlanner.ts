/**
 * Artifact planning + exposure layer.
 *
 * Decides what artifacts SHOULD exist once confidence is sufficient, and where
 * they would flow (feed, discovery, nearby, etc.). Phase 1: plans only — no auto-publish.
 */

import type { BusinessEntity } from './externalDataFusion.js';
import type { DesiredOutcome, IntentType, StructuredIntent } from './intentGapAnalyzer.js';

export type ArtifactKind =
  | 'store'
  | 'website'
  | 'business_profile'
  | 'supplier_record'
  | 'feed_content'
  | 'offer'
  | 'promotion'
  | 'content_pack'
  | 'media_collection'
  | 'catalog_draft'
  | 'recommendation_set';

export type ExposureSurface =
  | 'feed'
  | 'search'
  | 'discovery'
  | 'nearby'
  | 'recommendation'
  | 'supplier_matching'
  | 'content_graph'
  | 'suitcase'
  | 'intent_graph'
  | 'offers_lane';

export interface PlannedArtifact {
  kind: ArtifactKind;
  title: string;
  description: string;
  readiness: number;
  blockedBy: string[];
  draftOnly: boolean;
}

export interface ExposurePlan {
  surface: ExposureSurface;
  artifactKinds: ArtifactKind[];
  rationale: string;
  enabled: boolean;
  /** Phase 1: always false until user confirms publish. */
  autoExpose: boolean;
}

export interface ArtifactPlanResult {
  artifacts: PlannedArtifact[];
  exposure: ExposurePlan[];
  sufficientForGeneration: boolean;
  confirmationRequired: boolean;
}

const OUTCOME_TO_ARTIFACT: Record<DesiredOutcome, ArtifactKind[]> = {
  storefront: ['store', 'feed_content', 'business_profile'],
  website: ['website', 'business_profile', 'media_collection'],
  business_profile: ['business_profile'],
  catalog: ['catalog_draft', 'feed_content'],
  feed_card: ['feed_content'],
  offer_draft: ['offer', 'promotion'],
  recommendation: ['recommendation_set'],
  supplier_record: ['supplier_record'],
  content_pack: ['content_pack', 'media_collection'],
};

const INTENT_EXPOSURE: Record<IntentType, ExposureSurface[]> = {
  create_business_surface: ['feed', 'discovery', 'search', 'nearby'],
  create_website: ['search', 'discovery'],
  create_storefront: ['feed', 'discovery', 'nearby', 'content_graph'],
  enrich_catalog: ['feed', 'supplier_matching', 'content_graph'],
  find_supplier: ['recommendation', 'supplier_matching'],
  create_demand: ['recommendation', 'intent_graph', 'nearby'],
  create_promotion: ['offers_lane', 'feed'],
  unknown: ['discovery'],
};

function artifactReadiness(kind: ArtifactKind, entity: BusinessEntity): { score: number; blocked: string[] } {
  const blocked: string[] = [];
  let score = entity.confidence;

  switch (kind) {
    case 'store':
    case 'business_profile':
      if (!entity.canonicalName.value) blocked.push('businessName');
      if (entity.geo.confidence < 0.4 && !entity.contact.value.website) blocked.push('location_or_website');
      break;
    case 'website':
      if (!entity.canonicalName.value) blocked.push('businessName');
      if (entity.mediaAssets.value.length === 0) blocked.push('heroMedia');
      break;
    case 'catalog_draft':
      if (!entity.menu.value) blocked.push('menu');
      break;
    case 'feed_content':
      if (entity.mediaAssets.value.length === 0) blocked.push('mediaAssets');
      break;
    case 'offer':
    case 'promotion':
      if (!entity.menu.value && !entity.services.value.length) blocked.push('pricing_or_services');
      break;
    case 'recommendation_set':
      if (entity.categories.value.length === 0) blocked.push('category');
      break;
    default:
      break;
  }

  if (blocked.length) score = Math.max(0, score - 0.15 * blocked.length);
  return { score: Math.min(1, score), blocked };
}

/**
 * Plan artifacts and exposure targets from fused entity + structured intent.
 */
export function planArtifacts(
  intent: StructuredIntent,
  entity: BusinessEntity,
  opts?: { minConfidence?: number },
): ArtifactPlanResult {
  const minConfidence = opts?.minConfidence ?? 0.55;
  const kinds = new Set<ArtifactKind>();

  for (const outcome of intent.desiredOutcome) {
    for (const k of OUTCOME_TO_ARTIFACT[outcome] ?? []) kinds.add(k);
  }

  if (intent.intentType === 'enrich_catalog') kinds.add('catalog_draft');
  if (intent.intentType === 'create_demand') kinds.add('recommendation_set');

  const artifacts: PlannedArtifact[] = [...kinds].map((kind) => {
    const { score, blocked } = artifactReadiness(kind, entity);
    return {
      kind,
      title: kind.replace(/_/g, ' '),
      description: `Planned ${kind} from passive pipeline`,
      readiness: score,
      blockedBy: blocked,
      draftOnly: true,
    };
  });

  const surfaces = INTENT_EXPOSURE[intent.intentType] ?? ['discovery'];
  const exposure: ExposurePlan[] = surfaces.map((surface) => ({
    surface,
    artifactKinds: [...kinds],
    rationale: exposureRationale(surface, intent),
    enabled: entity.confidence >= minConfidence * 0.8,
    autoExpose: false,
  }));

  const sufficientForGeneration =
    entity.confidence >= minConfidence &&
    artifacts.some((a) => a.readiness >= minConfidence && a.blockedBy.length === 0);

  const confirmationRequired =
    entity.lowConfidenceFields.length > 0 || !sufficientForGeneration;

  return {
    artifacts,
    exposure,
    sufficientForGeneration,
    confirmationRequired: true,
  };
}

function exposureRationale(surface: ExposureSurface, intent: StructuredIntent): string {
  const name = intent.entities.businessName ?? 'business';
  switch (surface) {
    case 'nearby':
      return `Discovered ${name} can appear in nearby food/service lane when published.`;
    case 'offers_lane':
      return `Generated promos flow to Offers when owner confirms.`;
    case 'recommendation':
      return `Demand intents surface matching suppliers in recommendation graph.`;
    case 'feed':
      return `Feed cards generated from fused entity + media assets.`;
    default:
      return `Exposure on ${surface} after user confirmation.`;
  }
}

/** Continuous enrichment hooks (Phase 1 advisory). */
export interface EnrichmentLoopHint {
  trigger: string;
  action: string;
}

export function planContinuousEnrichment(entity: BusinessEntity): EnrichmentLoopHint[] {
  const hints: EnrichmentLoopHint[] = [
    {
      trigger: 'artifact_exposed',
      action: 'Collect engagement signals to refine ranking and confidence.',
    },
    {
      trigger: 'owner_claim',
      action: 'Upgrade provenance to owner-confirmed; unlock edit + publish.',
    },
  ];
  if (entity.reviews.confidence < 0.5) {
    hints.push({ trigger: 'new_reviews', action: 'Merge review data to improve supplier confidence.' });
  }
  if (entity.mediaAssets.value.length < 3) {
    hints.push({ trigger: 'user_upload_photo', action: 'Append customer photos to media graph.' });
  }
  return hints;
}
