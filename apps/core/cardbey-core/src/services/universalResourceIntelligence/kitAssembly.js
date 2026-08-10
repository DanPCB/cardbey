/**
 * Phase 5 — assemble business-ready Resource Kits from federated candidates.
 * Flat candidate lists remain available for debug; kits are the product output.
 */

import { saveResourceKit } from './resourceKits.js';
import { BUSINESS_TASK, CUSTODY_MODE } from './types.js';

const SLOT_TEMPLATES = Object.freeze({
  [BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST]: [
    { role: 'hero_image', kinds: ['image', 'photo'], count: 1 },
    { role: 'atmosphere_video', kinds: ['video'], count: 2 },
    { role: 'ambience', kinds: ['audio', 'music'], count: 1 },
    { role: 'supporting_image', kinds: ['image', 'photo'], count: 2 },
  ],
  [BUSINESS_TASK.CREATE_PROMOTION]: [
    { role: 'hero_image', kinds: ['image', 'photo'], count: 1 },
    { role: 'social_preview', kinds: ['image', 'photo'], count: 1 },
    { role: 'supporting_video', kinds: ['video'], count: 1 },
  ],
  [BUSINESS_TASK.CREATE_STOREFRONT_HERO]: [
    { role: 'hero_image', kinds: ['image', 'photo'], count: 1 },
    { role: 'gallery', kinds: ['image', 'photo'], count: 3 },
  ],
  [BUSINESS_TASK.CREATE_SOCIAL_POST]: [
    { role: 'primary_visual', kinds: ['image', 'photo', 'video'], count: 1 },
  ],
  [BUSINESS_TASK.ASSISTANT_ASSEMBLE_DRAFT]: [
    { role: 'hero_image', kinds: ['image', 'photo'], count: 1 },
    { role: 'supporting', kinds: ['image', 'photo', 'video'], count: 2 },
  ],
  default: [
    { role: 'hero_image', kinds: ['image', 'photo'], count: 1 },
    { role: 'supporting', kinds: ['image', 'photo', 'video'], count: 3 },
  ],
});

/**
 * @param {Array<object>} candidates — pipeline candidates with resource + explanation
 * @param {object} input
 */
export function assembleResourceKit(candidates = [], input = {}) {
  const task = input.businessTask || input.task || null;
  const templates = SLOT_TEMPLATES[task] || SLOT_TEMPLATES.default;
  const pool = [...candidates];
  const used = new Set();
  const slots = [];

  for (const tpl of templates) {
    const filled = [];
    for (const c of pool) {
      if (filled.length >= tpl.count) break;
      const id = c.resource?.id || c.id;
      if (!id || used.has(id)) continue;
      const kind = String(c.resource?.mediaType || c.resource?.kind || '').toLowerCase();
      if (tpl.kinds.length && !tpl.kinds.includes(kind) && kind) {
        // soft: allow if kinds include broad match
        if (!(tpl.kinds.includes('image') && (kind === 'photo' || kind === 'image'))) continue;
      }
      const custody =
        c.explanation?.custodyMode ||
        c.resource?.technical?.custodyMode ||
        CUSTODY_MODE.PROVIDER_HOSTED;
      if (custody === CUSTODY_MODE.REFERENCE_ONLY && input.excludeReferenceOnly) {
        continue;
      }
      used.add(id);
      filled.push({
        resourceId: id,
        candidateSnapshotId: c.candidateSnapshotId || null,
        sourceId: c.resource?.sourceId,
        kind,
        custodyMode: custody,
        attribution: c.explanation?.attribution || c.resource?.sourceMetadata?.attributionText,
        rightsDecision: c.rights?.decision || c.resource?.rightsSnapshot?.status,
        publicationEligible: custody !== CUSTODY_MODE.REFERENCE_ONLY,
      });
    }
    slots.push({
      role: tpl.role,
      requiredCount: tpl.count,
      filledCount: filled.length,
      items: filled,
      complete: filled.length >= Math.min(1, tpl.count),
    });
  }

  const resourceIds = [...used];
  const providerHosted = slots
    .flatMap((s) => s.items)
    .filter((i) => i.custodyMode === CUSTODY_MODE.PROVIDER_HOSTED).length;
  const referenceOnly = slots
    .flatMap((s) => s.items)
    .filter((i) => i.custodyMode === CUSTODY_MODE.REFERENCE_ONLY).length;
  const cardbeyOriginal = slots
    .flatMap((s) => s.items)
    .filter((i) => String(i.sourceId || '').includes('originals')).length;

  const summary = {
    totalResources: resourceIds.length,
    slotsComplete: slots.filter((s) => s.complete).length,
    slotsTotal: slots.length,
    providerHosted,
    cardbeyOriginal,
    referenceOnlyExcluded: referenceOnly,
  };

  if (!resourceIds.length) {
    return {
      ok: true,
      kit: null,
      slots,
      summary,
      note: 'no_candidates_to_fill_kit',
      authority: 'uri_kit_assembly',
    };
  }

  const kitSave = saveResourceKit({
    name:
      input.kitName ||
      input.name ||
      `${input.industry || 'Business'} ${task ? String(task).replace(/_/g, ' ') : 'Resource'} Kit`,
    industry: input.industry || null,
    resourceIds,
    components: slots.map((s) => ({
      role: s.role,
      resourceIds: s.items.map((i) => i.resourceId),
    })),
    slots: slots.map((s) => s.role),
    userId: input.userId,
    workspaceId: input.workspaceId,
    businessTask: task,
  });

  return {
    ok: Boolean(kitSave.ok),
    kit: kitSave.kit || null,
    slots,
    summary,
    authority: 'uri_kit_assembly',
  };
}
