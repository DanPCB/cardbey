/**
 * FactoryDefinition contract — reusable across Creative/Campaign/Store/Profile/Booking factories.
 */

import { z } from 'zod';
import { resolveInputMappingDeep } from './factoryPathUtils.js';

const StageRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).optional(),
  backoffMs: z.number().int().min(0).optional(),
});

const ApprovalPolicySchema = z.object({
  mode: z.enum(['per_stage', 'none']).optional(),
  defaultStatus: z.string().optional(),
  approvalStageId: z.string().optional(),
  planOutputPath: z.string().optional(),
  editableFields: z.array(z.string()).optional(),
  mergeStrategy: z.enum(['replace_plan', 'shallow_merge_plan', 'append_notes']).optional(),
});

const ArtifactPolicySchema = z.object({
  artifactType: z.string().optional(),
  persistOnComplete: z.boolean().optional(),
  persist: z.boolean().optional(),
  finalizeStageId: z.string().optional(),
  sourceStageIds: z.array(z.string()).optional(),
  artifactTypeResolver: z.enum(['policy', 'from_output']).optional(),
  requiredFields: z.array(z.string()).optional(),
});

const FactoryStageSchema = z.object({
  stageId: z.string().min(1),
  agentRole: z.string().min(1).optional(),
  builtinStage: z.boolean().optional(),
  toolName: z.string().min(1).optional(),
  skillName: z.string().min(1).optional(),
  inputMapping: z.record(z.unknown()).optional(),
  outputMapping: z.record(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  approvalKind: z.enum(['plan', 'final_asset']).optional(),
  requiredArtifacts: z.array(z.string()).optional(),
  optionalArtifacts: z.array(z.string()).optional(),
  retryPolicy: StageRetryPolicySchema.optional(),
  timeoutMs: z.number().int().min(1000).optional(),
});

export const FactoryDefinitionSchema = z.object({
  factoryId: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.unknown()).optional(),
  stages: z.array(FactoryStageSchema).min(1),
  approvalPolicy: ApprovalPolicySchema.optional(),
  artifactPolicy: ArtifactPolicySchema.optional(),
});

/**
 * @param {unknown} raw
 */
export function validateFactoryDefinition(raw) {
  const parsed = FactoryDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const def = parsed.data;
  const errors = [];
  const stageIds = new Set();

  for (const stage of def.stages) {
    if (stageIds.has(stage.stageId)) {
      errors.push(`duplicate stageId: ${stage.stageId}`);
    }
    stageIds.add(stage.stageId);

    if (!stage.requiresApproval && !stage.toolName && !stage.skillName && !stage.builtinStage) {
      if (stage.stageId !== 'artifact_finalize') {
        errors.push(`stage ${stage.stageId} needs toolName, skillName, builtinStage, or requiresApproval`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, definition: def };
}

/**
 * @param {Record<string, unknown>} mapping
 * @param {Record<string, unknown>} envelope
 */
export function resolveInputMapping(mapping, envelope) {
  return resolveInputMappingDeep(mapping, envelope);
}

/**
 * @param {Record<string, unknown>} output
 * @param {Record<string, string>|undefined} mapping
 */
export function applyOutputMapping(output, mapping) {
  if (!mapping || typeof mapping !== 'object') return output ?? {};
  const src = output && typeof output === 'object' ? output : {};
  const out = {};
  for (const [dest, path] of Object.entries(mapping)) {
    out[dest] = getPathLocal(src, path.replace(/^\$\./, ''));
  }
  return out;
}

function getPathLocal(obj, path) {
  if (!path) return obj;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}
