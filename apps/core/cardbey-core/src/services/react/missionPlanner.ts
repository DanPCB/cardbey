/**
 * ReAct mission planner (build-store / draft pipeline only).
 *
 * **Boundary (single runway):** This module orders *internal* ReAct steps from an allowlisted tool set
 * (`BUILD_STORE_REACT_TOOLS` or caller-supplied list). It does **not** replace Performer **Intake V2**
 * (`classifyIntent`, ontology, shortcuts) for user NL routing. Callers pass a short `intent` string +
 * `businessContext` after a build-store job is already queued — see `orchestraBuildStore.js`.
 *
 * **Env:** When `USE_LLM_TASK_PLANNER !== 'true'`, `planMission` returns `null` immediately (no LLM,
 * no second intent classifier). Do not use this to decide create-store vs analyze-store for console.
 */
import type { LLMGatewayLike, MissionPlan, PlannedStep } from '../../types/react.types.js';
import { getArtifactHandlerKinds } from '../../lib/toolExecutors/artifacts/editArtifact.js';
import { emitHealthProbe } from '../../lib/telemetry/healthProbes.js';
import { DEFAULT_HINT, PLANNER_HINTS } from './plannerHints.js';

function parseMissionPlanJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isPlannedStep(x: unknown): x is PlannedStep {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.tool === 'string' &&
    typeof o.label === 'string' &&
    (o.priority === 'required' || o.priority === 'optional')
  );
}

/**
 * LLM mission planner. Returns null when disabled or on parse/validation failure (caller uses static registry).
 * Does not interpret Performer Intake V2 families — only sequences allowed ReAct tool names.
 */
export async function planMission(
  intent: string,
  businessContext: Record<string, unknown>,
  availableTools: string[],
  llmGateway: LLMGatewayLike
): Promise<MissionPlan | null> {
  // Tests should never call external LLMs; keep planner disabled unless explicitly opted-in.
  if (process.env.NODE_ENV === 'test' && process.env.USE_LLM_TASK_PLANNER_TEST !== 'true') return null;
  if (process.env.USE_LLM_TASK_PLANNER !== 'true') return null;

  const PLANNER_SUPPORTED_INTENTS = new Set([
    'launch_campaign',
    'create_store',
    'mini_website',
    'create_mini_website',
    'edit_website',
    'campaign_research',
    'create_promotion',
  ]);
  const intentType = String((businessContext as any)?.intentType ?? intent ?? '').toLowerCase().trim();
  if (!PLANNER_SUPPORTED_INTENTS.has(intentType)) return null;

  const allow = new Set((availableTools && availableTools.length ? availableTools : getArtifactHandlerKinds()).map(String));
  const defaultProvider =
    typeof process.env.LLM_DEFAULT_PROVIDER === 'string' && process.env.LLM_DEFAULT_PROVIDER.trim()
      ? process.env.LLM_DEFAULT_PROVIDER.trim()
      : undefined;
  const defaultModel =
    typeof process.env.LLM_DEFAULT_MODEL === 'string' && process.env.LLM_DEFAULT_MODEL.trim()
      ? process.env.LLM_DEFAULT_MODEL.trim()
      : undefined;

  const system = `You are Cardbey's mission planner. You design optimal 
 execution plans for SME store and marketing missions.
 
 Rules:
 - Only use tools from the available tools list
 - Order steps by dependency (data needed before use)
 - Mark steps optional if they enhance but aren't required
 - Write skipIf conditions in plain English
 - Your reasoning explains WHY this specific plan
   for this specific business
 - Return valid JSON only, no prose

Tool roles (build-store drafts):
- research: validate / summarise store inputs
- catalog: build product catalogue from profile
- web_scrape_store_images: fetches real business images from website, Facebook, and Google before enrichment runs. Use before business_image_enrich. Outputs scrapedImages on the blackboard.
- business_image_enrich: enrich image search keywords with store name, location, and vertical signals before media runs (must precede media when images are used)
- media: generate / assign store visuals
- copy: refine descriptions`;

  const hint = PLANNER_HINTS[intentType] ?? DEFAULT_HINT;
  const user = `Intent: ${intent}

Planning hint:
${hint}

Business context:
${JSON.stringify(businessContext, null, 2)}

Available tools:
${[...allow].join(', ')}

Design the optimal mission plan.
Consider:
1. What signals are available for this business?
   (website URL, card image, name only, etc.)
2. Which tools are most valuable given those signals?
3. What order minimises wasted steps?
4. Which steps can be skipped if data already exists?
5. For store builds with images: include web_scrape_store_images after catalog, then business_image_enrich before media.

Return this exact JSON structure:
{
  "missionId": string (generate a short id),
  "reasoning": string (2-4 sentences explaining the plan),
  "steps": PlannedStep[],
  "estimatedSteps": number
}`;

  try {
    const { text } = await llmGateway.generate({
      purpose: 'react:mission_planner',
      prompt: `${system}\n\n${user}`,
      ...(defaultProvider ? { provider: defaultProvider } : {}),
      ...(defaultModel ? { model: defaultModel } : {}),
      tenantKey: 'react-planner',
      maxTokens: 1200,
      temperature: 0.25,
      responseFormat: 'json',
    });
    const raw = parseMissionPlanJson(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      console.warn('[planMission] parse failed: not an object');
      return null;
    }
    const obj = raw as Record<string, unknown>;
    const missionId = typeof obj.missionId === 'string' ? obj.missionId : `m_${Date.now()}`;
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';
    const estimatedSteps = typeof obj.estimatedSteps === 'number' ? obj.estimatedSteps : 0;
    const stepsRaw = obj.steps;
    if (!Array.isArray(stepsRaw) || !stepsRaw.every(isPlannedStep)) {
      console.warn('[planMission] invalid steps array');
      return null;
    }
    const steps = stepsRaw as PlannedStep[];
    for (const s of steps) {
      if (!allow.has(s.tool)) {
        console.warn('[planMission] tool not in allowlist:', s.tool);
        return null;
      }
    }
    const plan: MissionPlan = {
      missionId,
      reasoning,
      steps,
      estimatedSteps: estimatedSteps || steps.length,
      createdAt: Date.now(),
    };
    return plan;
  } catch (e) {
    const err = e as Error;
    const attempted =
      defaultModel && defaultProvider ? `${defaultProvider}:${defaultModel}` : defaultModel ?? defaultProvider ?? '(unset)';
    emitHealthProbe('planner_failure', {
      missionId: null,
      error: err?.message ?? String(e),
      model: attempted,
    });
    console.warn('[planMission] failed:', err?.message || e);
    return null;
  }
}
