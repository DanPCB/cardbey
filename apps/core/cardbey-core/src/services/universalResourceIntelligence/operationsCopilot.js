/**
 * Operations Copilot skeleton — advisory only; never mutates without confirmation.
 */

import { federationHealth, listSourceNodes } from './sourceFederation.js';
import { resourceIndexStats, listResourceIndex } from './resourceIndex.js';
import { listJobs } from './jobStore.js';
import { invokeAiModality } from './aiProviderRegistry.js';
import { AI_MODALITY } from './types.js';

/**
 * @param {string} question
 * @param {object} [context]
 */
export async function askOperationsCopilot(question, context = {}) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, error: 'question_required' };

  const health = federationHealth();
  const index = resourceIndexStats();
  const jobs = listJobs({ limit: 10 });
  const sources = listSourceNodes();

  const facts = {
    federation: health,
    index,
    recentJobs: jobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, error: j.error })),
    duplicateProviderHints: findDuplicateProviderHints(sources),
    lowQualityHints: listResourceIndex({ limit: 50 })
      .filter((r) => (r.qualitySnapshot?.score != null && Number(r.qualitySnapshot.score) < 40))
      .slice(0, 5)
      .map((r) => ({ id: r.id, title: r.title, score: r.qualitySnapshot.score })),
    rightsConflicts: listResourceIndex({ limit: 50 })
      .filter((r) => r.rightsSnapshot?.status === 'REJECTED' || r.rightsSnapshot?.status === 'UNKNOWN')
      .slice(0, 5)
      .map((r) => ({ id: r.id, status: r.rightsSnapshot?.status })),
  };

  let narrative = null;
  const reasoned = await invokeAiModality(AI_MODALITY.REASONING, {
    prompt: `Operations question: ${q}\nFacts JSON: ${JSON.stringify(facts).slice(0, 2000)}\nAnswer briefly with recommendations only.`,
  });
  if (reasoned.ok) {
    narrative = reasoned.text || reasoned.classification || null;
  }

  return {
    ok: true,
    answer: {
      question: q,
      narrative,
      facts,
      recommendations: buildRecommendations(q, facts),
      mutatesData: false,
      requiresConfirmationToAct: true,
      authority: 'operations_copilot_advisory',
    },
  };
}

function findDuplicateProviderHints(sources) {
  const byProtocol = {};
  for (const s of sources) {
    byProtocol[s.protocol] = byProtocol[s.protocol] || [];
    byProtocol[s.protocol].push(s.id);
  }
  return Object.entries(byProtocol)
    .filter(([, ids]) => ids.length > 1)
    .map(([protocol, ids]) => ({ protocol, sourceIds: ids }));
}

function buildRecommendations(q, facts) {
  const recs = [];
  const lower = q.toLowerCase();
  if (lower.includes('fail') || lower.includes('sync')) {
    const failed = facts.recentJobs.filter((j) => j.status === 'FAILED');
    recs.push(
      failed.length
        ? `Inspect failed jobs: ${failed.map((j) => j.id).join(', ')}`
        : 'No failed URI jobs in recent window.',
    );
  }
  if (lower.includes('duplicate')) {
    recs.push(
      facts.duplicateProviderHints.length
        ? 'Review federation nodes sharing the same protocol.'
        : 'No duplicate protocol clusters detected.',
    );
  }
  if (lower.includes('quality')) {
    recs.push(`Low-quality indexed candidates: ${facts.lowQualityHints.length}`);
  }
  if (lower.includes('rights')) {
    recs.push(`Rights conflict candidates: ${facts.rightsConflicts.length}`);
  }
  if (lower.includes('report') || lower.includes('weekly')) {
    recs.push(
      `Weekly sketch — sources active ${facts.federation.active}/${facts.federation.total}; index ${facts.index.total}; binaries stored ${facts.index.binariesStored}.`,
    );
  }
  if (!recs.length) {
    recs.push('Ask about sync failures, duplicates, quality, rights, or weekly report.');
  }
  return recs;
}
