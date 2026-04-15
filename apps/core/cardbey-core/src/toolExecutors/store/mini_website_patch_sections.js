import { runMiniWebsiteAgent } from '../../agents/miniWebsiteAgent.ts';

export async function execute(input, context) {
  const missionId = context?.mission?.id ?? context?.missionId ?? '';
  const storeId = input?.storeId ?? context?.mission?.metadataJson?.storeId ?? '';
  const tenantId = context?.mission?.userId ?? context?.tenantId ?? '';
  const threadId = context?.mission?.metadataJson?.threadId ?? undefined;

  const decision = input?.decision
    ?? context?.mission?.metadataJson?.decision
    ?? context?.stepOutputs?.propose_website_patch?.decision
    ?? 'approved';
  const patches = input?.patches
    ?? context?.stepOutputs?.generate_section_patches?.patches ?? [];
  const proposedTheme = input?.theme
    ?? context?.stepOutputs?.generate_section_patches?.theme ?? null;

  const result = await runMiniWebsiteAgent({
    role: 'applier',
    missionId,
    tenantId,
    storeId,
    userIntent: '',
    patches,
    proposedTheme,
    decision,
    threadId,
  });

  return {
    status: result.ok ? 'ok' : 'failed',
    output: {
      applied: result.applied ?? false,
      decision,
      error: result.error,
    },
  };
}
