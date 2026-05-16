/**
 * crm.js
 * CRM pipeline tool executor — Step 6.
 * Calls the CRM agent and returns a validated LeadLog.
 */

import { callAsAgent } from '../../agents/agentRegistry.js';
import { buildCrmPrompt } from '../../crmPromptBuilder.js';
import { assertLeadLog } from '../../agents/crmValidator.js';

/**
 * @param {object} input
 * @param {object} context
 * @returns {Promise<{ status: 'ok'|'failed', output?: object, error?: object }>}
 */
export async function execute(input = {}, context = {}) {
  const start = Date.now();
  const goal = input?.goal ?? context?.goal ?? 'Launch campaign';
  const tenantKey = context?.tenantId ?? context?.tenantKey ?? 'default';
  const missionRunId = context?.missionId ?? 'unknown';
  const stepOutputs = context?.stepOutputs ?? {};

  try {
    const prompt = buildCrmPrompt({ missionRunId, goal, stepOutputs });
    const raw = await callAsAgent('crm_agent', prompt, { tenantId: tenantKey });
    const leadLog = assertLeadLog(raw);

    return {
      status: 'ok',
      output: {
        leadLog,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[crm] executor error:', message);
    return {
      status: 'failed',
      error: { code: 'CRM_AGENT_ERROR', message },
      output: { durationMs: Date.now() - start },
    };
  }
}

