/**
 * Collection Intelligence — AI proposes candidate collections; editors approve.
 */

import { listResourceIndex } from './resourceIndex.js';

/** @type {Map<string, object>} */
const candidates = new Map();

/**
 * Build candidate collections from indexed resources (proposal only).
 */
export function proposeCollections({ industry } = {}) {
  const resources = listResourceIndex({ industry, limit: 100 });
  const byIndustry = new Map();
  for (const r of resources) {
    const key = r.industry || 'general';
    if (!byIndustry.has(key)) byIndustry.set(key, []);
    byIndustry.get(key).push(r.id);
  }

  const proposals = [];
  for (const [ind, ids] of byIndustry.entries()) {
    if (ids.length < 2) continue;
    const id = `colcand_${ind}`;
    const proposal = {
      id,
      name: `${titleCase(ind)} Starter Kit`,
      industry: ind,
      resourceIds: ids.slice(0, 24),
      status: 'CANDIDATE',
      requiresEditorApproval: true,
      createdAt: new Date().toISOString(),
      authority: 'collection_intelligence',
      published: false,
    };
    candidates.set(id, proposal);
    proposals.push(proposal);
  }

  // Named examples when signals match
  if (byIndustry.has('food-drink')) {
    const id = 'colcand_french_bakery';
    const proposal = {
      id,
      name: 'French Bakery',
      industry: 'food-drink',
      resourceIds: byIndustry.get('food-drink').slice(0, 12),
      status: 'CANDIDATE',
      requiresEditorApproval: true,
      createdAt: new Date().toISOString(),
      authority: 'collection_intelligence',
      published: false,
    };
    candidates.set(id, proposal);
    proposals.push(proposal);
  }

  return { ok: true, proposals, note: 'Editors must approve before Library publication' };
}

export function listCollectionCandidates() {
  return [...candidates.values()];
}

export function approveCollectionCandidate(id, { approve = false, editorId } = {}) {
  const c = candidates.get(id);
  if (!c) return { ok: false, error: 'not_found' };
  if (!approve) return { ok: false, error: 'approval_required' };
  const next = {
    ...c,
    status: 'APPROVED_PENDING_LIBRARY_PUBLISH',
    approvedAt: new Date().toISOString(),
    editorId: editorId || null,
    published: false,
  };
  candidates.set(id, next);
  return { ok: true, candidate: next, note: 'Approval recorded; Library publish is a separate step' };
}

function titleCase(s) {
  return String(s || '')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
