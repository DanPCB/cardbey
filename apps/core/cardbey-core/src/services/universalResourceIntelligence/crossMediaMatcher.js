/**
 * Phase 3 — cross-media combination recommendations.
 * AI may recommend; policy evaluates each component independently.
 */

import { evaluateResourceRights } from './rightsIntelligence.js';
import { explainCandidate } from './candidateExplainer.js';

/**
 * Propose a combination pack from ranked candidates (video + audio + image + template).
 * @param {Array} candidates — [{ resource, rights, explanation }]
 * @param {object} intent
 */
export function recommendCrossMediaCombination(candidates = [], intent = {}) {
  const byType = {
    video: [],
    image: [],
    audio: [],
    template: [],
    capability: [],
    other: [],
  };

  for (const c of candidates) {
    const r = c.resource || c;
    const t = String(r.mediaType || '').toLowerCase();
    if (t.includes('video')) byType.video.push(c);
    else if (t.includes('audio') || t.includes('music')) byType.audio.push(c);
    else if (t.includes('image') || t.includes('photo')) byType.image.push(c);
    else if (t.includes('template')) byType.template.push(c);
    else if (t.includes('capability')) byType.capability.push(c);
    else byType.other.push(c);
  }

  // Soft audio stand-in: calm image as visual bed when no audio indexed
  const video = byType.video[0] || null;
  const audio = byType.audio[0] || null;
  const image = byType.image[0] || byType.video[1] || null;
  const template = byType.template[0] || byType.capability[0] || null;

  const components = [
    video && componentEntry('video', video, intent),
    audio && componentEntry('audio', audio, intent),
    !audio && intent.audioForVideo && image && componentEntry('visual_bed_for_audio_gap', image, intent),
    image && componentEntry('image', image, intent),
    template && componentEntry('template', template, intent),
  ].filter(Boolean);

  const combinedUse = {
    purpose: intent.purpose || 'creative_workspace',
    channel: intent.channel || null,
    note: 'Each component rights-evaluated independently; combined intended use recorded separately',
  };

  const blocked = components.filter((c) => c.rights.decision?.decision === 'REJECTED');
  const needsReview = components.filter((c) => c.rights.decision?.decision === 'NEEDS_REVIEW');

  return {
    ok: true,
    recommended: components.length >= 2,
    combination: {
      id: `combo_${Date.now().toString(36)}`,
      components,
      combinedIntendedUse: combinedUse,
      policyNote: 'Policy engine evaluates components independently before combined use',
      readyForShortlist: blocked.length === 0,
      blockedCount: blocked.length,
      needsReviewCount: needsReview.length,
    },
  };
}

function componentEntry(role, candidate, intent) {
  const resource = candidate.resource || candidate;
  const rights = candidate.rights || evaluateResourceRights(resource);
  const explanation = candidate.explanation || explainCandidate(resource, rights, intent);
  return {
    role,
    resourceId: resource.id,
    mediaType: resource.mediaType,
    title: resource.title,
    sourceId: resource.sourceId,
    rights: {
      decision: rights.decision,
      suggestion: rights.suggestion,
      independent: true,
    },
    explanation: {
      whyItMatches: explanation.whyItMatches,
      custodyMode: explanation.custodyMode,
      attribution: explanation.attribution,
    },
  };
}
