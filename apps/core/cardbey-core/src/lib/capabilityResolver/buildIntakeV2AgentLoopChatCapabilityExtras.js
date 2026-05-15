import { resolveCapability } from './resolveCapability.js';
import { maybeBuildCapabilityBridgeArtifact } from './maybeBuildCapabilityBridgeArtifact.js';

/**
 * Optional enrichment for agent-loop direct chat mode.
 * Must be safe and never throw; intake should continue even if this fails.
 */
export async function buildIntakeV2AgentLoopChatCapabilityExtras(input) {
  const userMessage = String(input?.userMessage ?? '').trim();
  const enrichedMessage = String(input?.enrichedMessage ?? '').trim();
  const locale = input?.locale === 'vi' ? 'vi' : 'en';
  const responseText = String(input?.responseText ?? '').trim();

  const capabilityResolution = resolveCapability({
    userMessage,
    enrichedMessage,
    locale,
    hasImage: Boolean(input?.hasImage),
    imageOcrHasText: Boolean(input?.imageOcrHasText),
    storeId: input?.storeId,
    draftId: input?.draftId,
    missionId: input?.missionId,
    classification: { tool: 'general_chat', executionPath: 'chat', confidence: 0.95 },
  });

  const capabilityBridge = maybeBuildCapabilityBridgeArtifact({
    capabilityResolution,
    responseText,
    userMessage,
    locale,
    missionId: input?.missionId,
    extractedSnippet: input?.extractedSnippet ?? null,
    conversationHistory: input?.conversationHistory ?? [],
  });

  return {
    effectiveResponseText: responseText,
    capabilityResolution,
    capabilityBridge,
  };
}

