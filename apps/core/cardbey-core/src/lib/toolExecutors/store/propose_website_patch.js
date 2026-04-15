/**
 * propose_website_patch — builds WebsitePatchProposal payload for the performer UI.
 * Runner treats pendingApproval: true as pause (mission → paused) until POST .../resume { decision }.
 */

import { buildPatchProposal } from '../../llmSectionPatcher.js';

export async function execute(input = {}, context = {}) {
  const stepOutputs = context.stepOutputs && typeof context.stepOutputs === 'object' ? context.stepOutputs : {};
  const gen = stepOutputs.generate_section_patches;
  const fetch = stepOutputs.mini_website_get_sections;
  if (!gen || !fetch) {
    return {
      status: 'failed',
      error: {
        code: 'MISSING_PRIOR_STEPS',
        message: 'propose_website_patch requires generate_section_patches and mini_website_get_sections outputs',
      },
    };
  }

  const storeId = input.storeId ?? context.storeId ?? '';
  const proposal = buildPatchProposal({
    storeId,
    storeName: fetch.storeName ?? '',
    slug: fetch.slug ?? '',
    currentSections: fetch.sections ?? [],
    currentTheme: fetch.theme ?? null,
    patches: Array.isArray(gen.patches) ? gen.patches : [],
    theme: gen.theme ?? null,
    missionId: context.missionId ?? '',
  });

  return {
    status: 'ok',
    output: {
      pendingApproval: true,
      websitePatchProposal: proposal,
    },
  };
}
