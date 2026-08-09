/**
 * Phase 4–5 — resource graph: relationships, not folders / not provider-centric.
 */

import { listResourceIndex, getResourceRecord } from './resourceIndex.js';
import { listResourceKits } from './resourceKits.js';
import { listLearningEvents } from './learningEngine.js';
import { Features } from '../../config/features.js';

/** Industry relationship templates (Resource Intelligence Graph seeds). */
const INDUSTRY_RELATION_SEEDS = Object.freeze({
  'food-drink': [
    'atmosphere',
    'warm_lighting',
    'videos',
    'music',
    'fonts',
    'colours',
    'templates',
    'menus',
    'social_posts',
  ],
  beauty: ['atmosphere', 'soft_light', 'videos', 'colours', 'templates', 'social_posts'],
  retail: ['hero', 'product_gallery', 'videos', 'colours', 'templates', 'promotions'],
  default: ['atmosphere', 'hero', 'videos', 'templates', 'social_posts'],
});

/**
 * Build a connected graph around a resource / business / industry.
 */
export function buildResourceGraph(input = {}) {
  const resourceId = input.resourceId;
  const industry = input.industry || null;
  const businessId = input.businessId || input.storeId || null;
  const graphV1 = Boolean(Features.universalResourceIntelligence?.resourceGraphV1);

  const nodes = [];
  const edges = [];
  const seen = new Set();

  function addNode(node) {
    if (!node?.id || seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  }

  function addEdge(from, to, rel) {
    if (!from || !to) return;
    edges.push({ from, to, rel });
  }

  if (businessId) {
    addNode({ id: `biz_${businessId}`, type: 'business', label: 'Business' });
  }
  if (industry) {
    addNode({ id: `ind_${industry}`, type: 'industry', label: industry });
    if (businessId) addEdge(`biz_${businessId}`, `ind_${industry}`, 'operates_in');
  }

  // Relationship seeds — traverse concepts, not providers
  if (graphV1 && industry) {
    const seeds = INDUSTRY_RELATION_SEEDS[industry] || INDUSTRY_RELATION_SEEDS.default;
    let prev = `ind_${industry}`;
    for (const concept of seeds) {
      const cid = `concept_${industry}_${concept}`;
      addNode({ id: cid, type: 'concept', label: concept.replace(/_/g, ' ') });
      addEdge(prev, cid, 'suggests');
      prev = cid;
    }
  }

  const focus = resourceId ? getResourceRecord(resourceId) : null;
  const pool = focus
    ? [focus, ...listResourceIndex({ industry: focus.industry || industry, limit: 24 })]
    : listResourceIndex({ industry, limit: 32 });

  for (const r of pool) {
    addNode({
      id: r.id,
      type: 'resource',
      label: r.title,
      mediaType: r.mediaType,
      sourceId: r.sourceId,
    });
    if (r.industry) {
      addNode({ id: `ind_${r.industry}`, type: 'industry', label: r.industry });
      addEdge(r.id, `ind_${r.industry}`, 'belongs_to_industry');
    }
    if (r.sourceId) {
      addNode({ id: r.sourceId, type: 'source', label: r.sourceId });
      addEdge(r.id, r.sourceId, 'from_source');
    }
    const creator =
      r.sourceMetadata?.photographer || r.sourceMetadata?.creatorId || null;
    if (creator) {
      const cid = `creator_${String(creator).replace(/\s+/g, '_').slice(0, 40)}`;
      addNode({ id: cid, type: 'creator', label: creator });
      addEdge(r.id, cid, 'created_by');
    }
    if (businessId) addEdge(`biz_${businessId}`, r.id, 'may_reuse');
  }

  for (const kit of listResourceKits({ industry, limit: 10 })) {
    addNode({ id: kit.id, type: 'collection', label: kit.name });
    for (const rid of kit.resourceIds.slice(0, 12)) {
      addEdge(kit.id, rid, 'contains');
      if (businessId) addEdge(`biz_${businessId}`, kit.id, 'owns_kit');
    }
  }

  // Learning-derived “used together”
  const events = listLearningEvents({ limit: 100 });
  const co = coOccurrence(events);
  for (const [pair, count] of co) {
    if (count < 2) continue;
    const [a, b] = pair.split('|');
    addEdge(a, b, 'frequently_used_together');
  }

  if (input.campaignId) {
    addNode({ id: `camp_${input.campaignId}`, type: 'campaign', label: 'Campaign' });
    if (businessId) addEdge(`biz_${businessId}`, `camp_${input.campaignId}`, 'runs');
  }
  if (input.capabilityId) {
    addNode({
      id: `cap_${input.capabilityId}`,
      type: 'capability',
      label: 'Capability',
    });
  }
  if (input.displayPlaylistId) {
    addNode({
      id: `pl_${input.displayPlaylistId}`,
      type: 'display',
      label: 'Display playlist',
    });
  }

  return {
    ok: true,
    graph: { nodes, edges },
    focusResourceId: resourceId || null,
    mode: graphV1 ? 'relationship_graph_v1' : 'advisory',
    note: 'Graph relationships — not provider folders. Rights/custody still per resource.',
  };
}

function coOccurrence(events) {
  const map = new Map();
  const bySession = new Map();
  for (const e of events) {
    const sid = e.payload?.sessionId || e.sessionId || e.workspaceId;
    const rid = e.resourceId || e.payload?.resourceId;
    if (!sid || !rid) continue;
    if (!bySession.has(sid)) bySession.set(sid, new Set());
    bySession.get(sid).add(rid);
  }
  for (const set of bySession.values()) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('|');
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }
  return map;
}
