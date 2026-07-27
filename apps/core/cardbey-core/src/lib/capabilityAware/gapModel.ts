/**
 * Structured gap resolution vs normalized capability registry (deterministic).
 */

import type { MissionRequirement, RequirementResolution } from './types.ts';
import { getCapabilityById } from './capabilityRegistryAdapter.ts';

function hasAnyEnv(env: Record<string, string | undefined>, keys: string[]): boolean {
  return keys.some((key) => Boolean(String(env[key] ?? '').trim()));
}

function envRecord(env?: Record<string, string>): Record<string, string | undefined> {
  if (env) return env;
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

export function resolveCapabilityGaps(
  requirements: MissionRequirement[],
  env?: Record<string, string>,
): RequirementResolution[] {
  const sourceEnv = envRecord(env);
  return requirements.map((requirement): RequirementResolution => {
    const capability = getCapabilityById(requirement.id);
    const base = {
      requirementId: requirement.id,
      matchedCapabilityId: capability?.id,
    };

    switch (requirement.id) {
      case 'req_llm_gen': {
        const hasModel = Boolean(String(sourceEnv.LLM_DEFAULT_MODEL ?? '').trim());
        const hasProvider = hasAnyEnv(sourceEnv, ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
        return {
          ...base,
          state: hasModel && hasProvider ? 'ready' : 'missing',
          notes: hasModel && hasProvider ? 'llm_ready' : 'missing_model_or_provider_key',
        };
      }
      case 'req_image_search':
        return { ...base, state: 'ready', notes: 'internal_or_unsplash_image_search' };
      case 'req_web_scrape':
        return { ...base, state: 'ready', notes: 'internal_web_scrape_available' };
      case 'req_content_res':
        return { ...base, state: 'ready', notes: 'content_resolution_module_available' };
      case 'req_qr_gen':
        return { ...base, state: 'ready', notes: 'qrcode_available' };
      case 'req_concierge':
        return { ...base, state: 'ready', notes: 'smart_document_concierge_available' };
      case 'req_web_search':
        return { ...base, state: 'ready', notes: 'web_search_available' };
      case 'req_stripe':
        return {
          ...base,
          state: String(sourceEnv.STRIPE_SECRET_KEY ?? '').trim() ? 'ready' : 'fetchable',
          notes: String(sourceEnv.STRIPE_SECRET_KEY ?? '').trim() ? 'stripe_configured' : 'stripe_can_be_configured',
        };
      case 'req_gmail':
        return {
          ...base,
          state:
            String(sourceEnv.GMAIL_MCP_URL ?? '').trim() && String(sourceEnv.GMAIL_MCP_TOKEN ?? '').trim()
              ? 'ready'
              : 'fetchable',
          notes:
            String(sourceEnv.GMAIL_MCP_URL ?? '').trim() && String(sourceEnv.GMAIL_MCP_TOKEN ?? '').trim()
              ? 'gmail_mcp_configured'
              : 'gmail_mcp_can_be_configured',
        };
      case 'req_calendar':
        return {
          ...base,
          state:
            String(sourceEnv.GOOGLE_CALENDAR_MCP_URL ?? '').trim() || String(sourceEnv.GOOGLE_CALENDAR_MCP_TOKEN ?? '').trim()
              ? 'ready'
              : 'fetchable',
          notes:
            String(sourceEnv.GOOGLE_CALENDAR_MCP_URL ?? '').trim() || String(sourceEnv.GOOGLE_CALENDAR_MCP_TOKEN ?? '').trim()
              ? 'calendar_mcp_available'
              : 'calendar_mcp_can_be_configured',
        };
      default:
        return {
          ...base,
          state: 'missing',
          notes: 'unknown_requirement',
        };
    }
  });
}

export function summarizeGaps(resolutions: RequirementResolution[]): {
  allReady: boolean;
  criticalMissing: string[];
  fetchable: string[];
  optional: string[];
} {
  const criticalMissing = resolutions
    .filter((item) => item.state === 'missing')
    .map((item) => item.requirementId);
  const fetchable = resolutions
    .filter((item) => item.state === 'fetchable')
    .map((item) => item.requirementId);
  const optional = resolutions
    .filter((item) => item.state === 'partial' || item.state === 'substitutable' || item.state === 'delegatable')
    .map((item) => item.requirementId);

  return {
    allReady: criticalMissing.length === 0,
    criticalMissing,
    fetchable,
    optional,
  };
}
