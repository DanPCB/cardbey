/**
 * User-facing candidate explanation (Phase 2 + Phase 3 workspace).
 */

import { CUSTODY_MODE, CUSTODY_MODE_PHASE2_ENABLED, POLICY_VERSION } from './types.js';
import { buildContextActions } from './contextActions.js';

/**
 * Build truthful explanation + actions for a ranked candidate.
 * @param {object} resource
 * @param {object} rights
 * @param {object} intent
 * @param {object} [opts]
 */
export function explainCandidate(resource, rights, intent = {}, opts = {}) {
  const custodyMode = recommendCustodyMode(resource);
  const decision = rights?.decision?.decision || rights?.decision || 'NEEDS_REVIEW';
  const suggestion = rights?.suggestion?.suggestion || rights?.suggestion || 'UNKNOWN';
  const creator =
    resource.sourceMetadata?.photographer ||
    resource.sourceMetadata?.creatorLabel ||
    resource.sourceMetadata?.creatorId ||
    'Unknown creator';
  const source = resource.sourceId || resource.provenance?.provider || 'unknown';
  const mediaType = resource.mediaType || 'unknown';
  const orientation =
    resource.technical?.orientation ||
    resource.aiMetadata?.orientation ||
    (intent.orientation || 'landscape');
  const confidence = Number(resource.aiMetadata?.confidence || 0.55);
  const rightsCheckedAt = opts.rightsCheckedAt || new Date().toISOString();

  const why = buildWhyMatches(resource, intent);
  const permitted = buildPermittedUses(source, decision, suggestion);
  const restrictions = buildRestrictions(source, decision, custodyMode);

  return {
    resourceId: resource.id,
    whyItMatches: why,
    source,
    creator,
    technicalFit: {
      mediaType,
      orientation,
      previewUrl: resource.previewUrl || null,
      canonicalUrl: resource.canonicalUrl || null,
      loopCompatible: mediaType === 'video' || Boolean(intent.channel === 'display'),
      commercialDisplayIntent: /commercial|display/.test(
        String(intent.purpose || intent.channel || ''),
      ),
      multimodalHints: intent.modalities || [],
    },
    mediaSpecifications: {
      mediaType,
      orientation,
      previewUrl: resource.previewUrl || null,
      canonicalUrl: resource.canonicalUrl || null,
      loopCompatible: mediaType === 'video' || Boolean(intent.channel === 'display'),
      commercialDisplayIntent: /commercial|display/.test(
        String(intent.purpose || intent.channel || ''),
      ),
    },
    likelyPermittedUses: permitted,
    restrictions,
    attribution: {
      required: source === 'src_pexels' || Boolean(creator && creator !== 'Unknown creator'),
      text:
        source === 'src_pexels'
          ? `Photo/video by ${creator} via Pexels`
          : creator !== 'Unknown creator'
            ? `Credit: ${creator}`
            : 'Attribution per source licence',
      photographer: creator,
      provider: source,
    },
    custodyMode,
    availableCustodyModes: [...CUSTODY_MODE_PHASE2_ENABLED],
    confidence,
    rightsDecision: decision,
    rightsSummary: {
      aiSuggestion: suggestion,
      policyDecision: decision,
      publicationAllowed: Boolean(rights?.decision?.publicationAllowed),
      policyVersion: rights?.decision?.policyApplied || POLICY_VERSION,
      freshness: {
        checkedAt: rightsCheckedAt,
        staleAfterSec: 3600,
        note: 'Revalidated again at confirm/place time',
      },
    },
    actions: {
      useInProject: decision !== 'REJECTED',
      pullForUse: custodyMode === CUSTODY_MODE.PULL_ON_USE && decision !== 'REJECTED',
      saveReference: true,
      viewSource: Boolean(resource.canonicalUrl || resource.previewUrl),
      findSaferAlternative: decision === 'NEEDS_REVIEW' || decision === 'REJECTED',
      addToShortlist: decision !== 'REJECTED',
      compareRights: true,
    },
    contextActions: buildContextActions({
      origin: opts.origin || intent.origin || 'assistant',
      businessTask: opts.businessTask || intent.businessTask,
      explanation: { rightsDecision: decision },
      rights,
      consumer: opts.consumer,
      admin: opts.admin,
    }),
  };
}

function recommendCustodyMode(resource) {
  if (resource.sourceId === 'src_pexels' || resource.technical?.hostingMode === 'REFERENCE') {
    return CUSTODY_MODE.PROVIDER_HOSTED;
  }
  if (resource.sourceId?.startsWith('src_cardbey')) {
    return CUSTODY_MODE.REFERENCE_ONLY;
  }
  return CUSTODY_MODE.PULL_ON_USE;
}

function buildWhyMatches(resource, intent) {
  const parts = [];
  if (intent.industry && resource.industry === intent.industry) {
    parts.push(`Matches industry “${intent.industry}”`);
  }
  if (intent.mediaType && String(resource.mediaType).toLowerCase() === String(intent.mediaType).toLowerCase()) {
    parts.push(`Media type ${resource.mediaType}`);
  }
  if (intent.channel === 'display') {
    parts.push('Suitable for digital display context');
  }
  if (resource.aiMetadata?.mood) parts.push(`Mood: ${resource.aiMetadata.mood}`);
  if (resource.aiMetadata?.useCases?.length) {
    parts.push(`Use cases: ${resource.aiMetadata.useCases.slice(0, 3).join(', ')}`);
  }
  if (!parts.length) parts.push('Federated candidate matching search intent');
  return parts;
}

function buildPermittedUses(source, decision, suggestion) {
  if (decision === 'REJECTED') return [];
  if (source === 'src_pexels') {
    return [
      'Reference / provider-hosted display (pilot)',
      'Editorial and commercial display when Pexels licence allows',
      'Attribution retained in Cardbey usage record',
    ];
  }
  if (source?.startsWith('src_cardbey')) {
    return ['Platform-indexed Cardbey catalogue use under Cardbey rights'];
  }
  if (suggestion === 'SUGGESTED') return ['Likely usable pending policy confirmation'];
  return ['Pending rights review'];
}

function buildRestrictions(source, decision, custodyMode) {
  const out = [];
  if (decision === 'REJECTED') out.push('Blocked by rights policy — do not use');
  if (decision === 'NEEDS_REVIEW') out.push('Requires human/policy confirmation before publication');
  if (custodyMode === CUSTODY_MODE.PROVIDER_HOSTED || custodyMode === CUSTODY_MODE.REFERENCE_ONLY) {
    out.push('No Cardbey binary custody in this mode');
  }
  if (source === 'src_pexels') {
    out.push('Not for stock resale or bulk ML dataset scraping');
    out.push('Do not remove attribution');
  }
  out.push('Playlist remains draft — not auto-published to devices');
  return out;
}
