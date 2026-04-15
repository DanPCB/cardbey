import { runMiniWebsiteAgent } from '../../agents/miniWebsiteAgent.ts';

export async function execute(input, context) {
  const missionId = context?.mission?.id ?? context?.missionId ?? '';
  const storeId = input?.storeId ?? context?.mission?.metadataJson?.storeId ?? '';
  const tenantId = context?.mission?.userId ?? context?.tenantId ?? '';
  const threadId = context?.mission?.metadataJson?.threadId ?? undefined;

  const patches = input?.patches ?? context?.stepOutputs?.generate_section_patches?.patches ?? [];
  const proposedTheme = input?.proposedTheme
    ?? context?.stepOutputs?.generate_section_patches?.theme ?? null;
  const currentSections = input?.currentSections
    ?? context?.stepOutputs?.mini_website_get_sections?.sections ?? [];
  const currentTheme = input?.currentTheme
    ?? context?.stepOutputs?.mini_website_get_sections?.theme ?? null;
  const storeName = input?.storeName
    ?? context?.stepOutputs?.mini_website_get_sections?.storeName ?? '';
  const slug = input?.slug
    ?? context?.stepOutputs?.mini_website_get_sections?.slug ?? '';

  const result = await runMiniWebsiteAgent({
    role: 'proposer',
    missionId,
    tenantId,
    storeId,
    userIntent: '',
    patches,
    proposedTheme,
    currentSections,
    currentTheme,
    storeName,
    slug,
    threadId,
  });

  return {
    status: result.ok ? 'ok' : 'failed',
    output: {
      pendingApproval: result.pendingApproval ?? false,
      decision: result.pendingApproval ? null : 'approved',
      patches: result.patches ?? [],
      theme: result.theme ?? null,
      error: result.error,
      websitePatchProposal: result.pendingApproval
        ? {
            patches: result.patches ?? [],
            theme: result.theme ?? null,
          }
        : null,
    },
  };
}
