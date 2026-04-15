/**
 * Mini Website Agent.
 * Orchestrates reading, patching, and proposing changes to a store's mini website.
 * Uses LLM to generate section patches from user intent, then emits a proposal
 * for owner approval before applying changes.
 *
 * Roles:
 *   'editor'   → loads current sections + calls LLM to generate patches
 *   'proposer' → emits WebsitePatchProposal FormCard and pauses for approval
 *   'applier'  → applies approved patches to the store record
 */

import { getPrismaClient } from '../lib/prisma.js';
import { broadcastAgentMessage, broadcastThreadMessage } from '../realtime/simpleSse.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';
import { generateSectionPatches, buildPatchProposal } from '../lib/llmSectionPatcher.js';
import { miniWebsiteEditorSkill } from '../skills/miniWebsiteEditorSkill.js';
import { pauseMissionPipeline } from '../lib/missionPipelineService.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MiniWebsiteAgentParams {
  missionId: string;
  tenantId: string;
  storeId: string;
  userIntent: string;
  threadId?: string;
  role?: 'editor' | 'proposer' | 'applier';
  currentSections?: unknown[];
  currentTheme?: { templateId?: string } | null;
  patches?: Array<{ type: string; content: Record<string, unknown> }>;
  proposedTheme?: { templateId?: string } | null;
  storeName?: string;
  slug?: string;
  decision?: 'approved' | 'discarded' | null;
}

export interface MiniWebsiteAgentResult {
  ok: boolean;
  role: string;
  sections?: unknown[];
  patches?: Array<{ type: string; content: Record<string, unknown> }>;
  theme?: { templateId?: string } | null;
  storeName?: string;
  slug?: string;
  pendingApproval?: boolean;
  applied?: boolean;
  error?: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function getStoreContext(storeId: string): Promise<{
  storeName: string;
  slug: string;
  sections: unknown[];
  theme: { templateId?: string } | null;
} | null> {
  const prisma = getPrismaClient();
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { name: true, slug: true, stylePreferences: true },
  }).catch(() => null);

  if (!business) return null;

  const stylePrefs = business.stylePreferences as Record<string, unknown> | null;
  const miniWebsite = stylePrefs?.miniWebsite as {
    sections?: unknown[];
    theme?: { templateId?: string };
  } | null;

  return {
    storeName: business.name,
    slug: business.slug,
    sections: miniWebsite?.sections ?? [],
    theme: miniWebsite?.theme ?? null,
  };
}

async function postAgentMessage(
  missionId: string,
  text: string,
  messageType: string,
  payload?: Record<string, unknown>,
  threadId?: string,
): Promise<void> {
  const message = await createAgentMessage({
    missionId,
    threadId,
    senderId: 'mini_website_editor',
    senderType: 'agent',
    channel: 'main',
    text,
    messageType,
    payload,
    visibleToUser: true,
  });
  broadcastAgentMessage(missionId, { missionId, message });
  if (threadId) broadcastThreadMessage(threadId, { threadId, message });
}

// ── Role: editor ──────────────────────────────────────────────────────────────

async function runEditorRole(params: MiniWebsiteAgentParams): Promise<MiniWebsiteAgentResult> {
  const { missionId, storeId, userIntent, currentSections, currentTheme, threadId } = params;

  const storeCtx = await getStoreContext(storeId);
  if (!storeCtx) return { ok: false, role: 'editor', error: 'Store not found' };

  const sections = (currentSections?.length ? currentSections : storeCtx.sections) as unknown[];
  const theme = currentTheme ?? storeCtx.theme;

  if (!sections.length) {
    await postAgentMessage(
      missionId,
      'This store doesn\'t have a mini website yet. Create one first using "Create mini website".',
      'text',
      undefined,
      threadId,
    );
    return { ok: false, role: 'editor', error: 'no_mini_website' };
  }

  await postAgentMessage(
    missionId,
    `Analysing your website and generating changes for: "${userIntent}"`,
    'text',
    undefined,
    threadId,
  );

  let patches: Array<{ type: string; content: Record<string, unknown> }>;
  let proposedTheme: { templateId?: string } | null = null;

  try {
    const result = await generateSectionPatches({
      currentSections: sections,
      userIntent,
    });
    patches = result.patches ?? [];
    proposedTheme = result.theme ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[miniWebsiteAgent:editor] LLM patch generation failed:', message);
    await postAgentMessage(
      missionId,
      `I couldn't generate website changes right now: ${message}. Please try again.`,
      'text',
      undefined,
      threadId,
    );
    return { ok: false, role: 'editor', error: message };
  }

  if (!patches.length && !proposedTheme) {
    await postAgentMessage(
      missionId,
      'No changes needed — your website already matches that request.',
      'text',
      undefined,
      threadId,
    );
    return {
      ok: true,
      role: 'editor',
      sections,
      patches: [],
      theme,
      storeName: storeCtx.storeName,
      slug: storeCtx.slug,
    };
  }

  return {
    ok: true,
    role: 'editor',
    sections,
    patches,
    theme: proposedTheme ?? theme,
    storeName: storeCtx.storeName,
    slug: storeCtx.slug,
  };
}

// ── Role: proposer ────────────────────────────────────────────────────────────

async function runProposerRole(params: MiniWebsiteAgentParams): Promise<MiniWebsiteAgentResult> {
  const {
    missionId,
    storeId,
    patches = [],
    proposedTheme,
    currentSections = [],
    currentTheme,
    storeName,
    slug,
    threadId,
  } = params;

  if (!patches.length) {
    return { ok: true, role: 'proposer', pendingApproval: false, patches: [] };
  }

  const storeCtx = await getStoreContext(storeId);
  if (!storeCtx) return { ok: false, role: 'proposer', error: 'Store not found' };

  const proposal = buildPatchProposal({
    storeId,
    storeName: storeName ?? storeCtx.storeName,
    slug: slug ?? storeCtx.slug,
    currentSections: currentSections.length ? currentSections : storeCtx.sections,
    currentTheme: currentTheme ?? storeCtx.theme,
    patches,
    theme: proposedTheme ?? null,
    missionId,
  });

  await postAgentMessage(
    missionId,
    'I\'ve prepared the following changes to your website. Review and approve to apply them.',
    'form_card',
    { formCard: proposal },
    threadId,
  );

  const pauseResult = await pauseMissionPipeline(missionId, {
    pendingApproval: 'website_patch',
    proposalEmittedAt: new Date().toISOString(),
  });

  if (!pauseResult.ok) {
    console.warn('[miniWebsiteAgent:proposer] pauseMissionPipeline failed:', pauseResult.error);
  }

  return {
    ok: true,
    role: 'proposer',
    pendingApproval: true,
    patches,
    theme: proposedTheme ?? null,
  };
}

// ── Role: applier ─────────────────────────────────────────────────────────────

async function runApplierRole(params: MiniWebsiteAgentParams): Promise<MiniWebsiteAgentResult> {
  const { missionId, storeId, patches = [], proposedTheme, decision, threadId } = params;

  if (decision === 'discarded') {
    await postAgentMessage(
      missionId,
      'Website changes discarded — no modifications were made.',
      'text',
      undefined,
      threadId,
    );
    return { ok: true, role: 'applier', applied: false };
  }

  if (!patches.length) {
    return { ok: true, role: 'applier', applied: false };
  }

  const prisma = getPrismaClient();

  try {
    await miniWebsiteEditorSkill.tools.patchSections({
      storeId,
      patch: patches,
      theme: proposedTheme ?? null,
      prisma,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[miniWebsiteAgent:applier] patchSections failed:', message);
    await postAgentMessage(
      missionId,
      `Failed to apply website changes: ${message}`,
      'text',
      undefined,
      threadId,
    );
    return { ok: false, role: 'applier', error: message };
  }

  const storeCtx = await getStoreContext(storeId);
  await postAgentMessage(
    missionId,
    `Your website has been updated. View it live at /s/${storeCtx?.slug ?? storeId}`,
    'text',
    {
      links: storeCtx
        ? [{ label: 'View live website', href: `/s/${storeCtx.slug}` }]
        : [],
    },
    threadId,
  );

  return { ok: true, role: 'applier', applied: true };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runMiniWebsiteAgent(
  params: MiniWebsiteAgentParams,
): Promise<MiniWebsiteAgentResult> {
  const role = params.role ?? 'editor';
  const missionIdTrimmed = (params.missionId || '').trim();

  if (!missionIdTrimmed) {
    console.warn('[miniWebsiteAgent] missionId required');
    return { ok: false, role, error: 'missionId required' };
  }
  if (!params.storeId?.trim()) {
    console.warn('[miniWebsiteAgent] storeId required');
    return { ok: false, role, error: 'storeId required' };
  }

  const safeParams = { ...params, missionId: missionIdTrimmed };

  switch (role) {
    case 'editor':   return runEditorRole(safeParams);
    case 'proposer': return runProposerRole(safeParams);
    case 'applier':  return runApplierRole(safeParams);
    default:         return { ok: false, role, error: `Unknown role: ${role}` };
  }
}
