import type { LLMGatewayLike, ValidationIssue, ValidationResult } from '../../types/react.types.js';
import type { MissionReactBlackboardLike } from '../../types/react.types.js';

function tryParseValidation(text: string): Partial<ValidationResult> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Partial<ValidationResult>;
  } catch {
    return null;
  }
}

function normalizeIssues(raw: unknown): ValidationIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: ValidationIssue[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    out.push({
      slot: typeof o.slot === 'string' ? o.slot : 'unknown',
      issue: typeof o.issue === 'string' ? o.issue : '',
      autoFixable: Boolean(o.autoFixable),
      fixHint: typeof o.fixHint === 'string' ? o.fixHint : '',
    });
  }
  return out;
}

/**
 * Post-pipeline output validation (LLM). Auto-fix hooks are reserved for a later content pass.
 */
export async function validateMissionOutput(
  businessContext: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  llmGateway: LLMGatewayLike,
  options?: {
    blackboardWriter?: MissionReactBlackboardLike;
    reasoningLog?: string[];
    emitConsole?: (m: string) => void | Promise<void>;
  }
): Promise<ValidationResult> {
  if (process.env.USE_OUTPUT_VALIDATION !== 'true') {
    return { valid: true, issues: [], reasoning: 'Validation disabled.', autoFixed: [] };
  }

  const generatedProducts =
    (blackboard.generatedProducts as unknown) ??
    (blackboard.draftProducts as unknown) ??
    (blackboard.catalog_products as unknown);
  const selectedImages = (blackboard.selectedImages as unknown) ?? (blackboard.selectedHeroImageTags as unknown);
  const generatedProfile =
    (blackboard.generatedProfile as Record<string, unknown> | undefined) ??
    (blackboard.profile as Record<string, unknown> | undefined) ??
    {};
  const businessVertical = (businessContext.vertical ?? blackboard.businessVertical) as string | undefined;
  const subcategory = (businessContext.subcategory ?? blackboard.subcategory) as string | undefined;
  const contentManifest = blackboard.contentManifest;

  const system =
    "You are Cardbey's output validator.\n Check if a generated store matches the real business.\n Be specific about issues. Identify auto-fixable ones.\n Return valid JSON only.";

  const user = `Business:
 Name: ${String(businessContext.name ?? '')}
 Vertical: ${String(businessVertical ?? '')}
 Subcategory: ${String(subcategory ?? '')}
 Known real products: ${JSON.stringify(businessContext.knownProducts ?? [])}

Generated store:
 Products: ${JSON.stringify(generatedProducts ?? [])}
 Tagline: ${String(generatedProfile.tagline ?? '')}
 Description: ${String(generatedProfile.description ?? '')}
 Hero image tags: ${JSON.stringify(selectedImages ?? [])}
 Content manifest: ${JSON.stringify(contentManifest ?? null)}

Check each:
1. Product vertical alignment — Do ALL products belong to vertical/subcategory?
2. Product authenticity — Are products specific or generic placeholders?
3. Content coherence — Does tagline/description match the business?
4. Critical missing slots — What important content is empty?

Return:
{
  "valid": boolean,
  "issues": ValidationIssue[],
  "reasoning": string,
  "autoFixed": string[]
}`;

  let valid = true;
  let issues: ValidationIssue[] = [];
  let reasoning = 'Validation skipped (LLM unavailable).';
  const autoFixed: string[] = [];

  try {
    const { text } = await llmGateway.generate({
      purpose: 'react:output_validator',
      prompt: `${system}\n\n${user}`,
      tenantKey: 'react-validator',
      maxTokens: 900,
      temperature: 0.2,
      responseFormat: 'json',
    });
    const parsed = tryParseValidation(text);
    if (parsed) {
      valid = Boolean(parsed.valid);
      issues = normalizeIssues(parsed.issues);
      reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : reasoning;
      if (Array.isArray(parsed.autoFixed)) {
        autoFixed.push(...parsed.autoFixed.map((x) => String(x)));
      }
    }
  } catch (e) {
    reasoning = `Validator error: ${(e as Error)?.message || String(e)}`;
    valid = true;
  }

  // Advisory-only: never throw from this validator. Downstream must not abort the store on `valid === false`;
  // issues are for Mission.context / blackboard (`react_validation`) and logs only.
  const result: ValidationResult = { valid, issues, reasoning, autoFixed };

  options?.blackboardWriter?.write('react_validation', result);
  const log = options?.reasoningLog;
  if (log) {
    if (result.valid) log.push('✓ Output validation passed');
    else log.push(`⚠ Issues found: ${result.issues.map((i) => i.slot).join(', ')}`);
    if (result.autoFixed.length) log.push(`↻ Auto-fixed: ${result.autoFixed.join(', ')}`);
  }
  options?.blackboardWriter?.appendReasoningLog(
    result.valid ? '✓ Output validation passed' : `⚠ Issues found: ${result.issues.map((i) => i.slot).join(', ')}`
  );

  const emit = options?.emitConsole;
  if (emit && !result.valid) {
    const slots = result.issues.filter((i) => !i.autoFixable).map((i) => i.slot);
    if (slots.length) await Promise.resolve(emit(`⚠ Review recommended for: ${slots.join(', ')}`));
  }
  if (emit && result.autoFixed.length) {
    await Promise.resolve(emit(`↻ Improved ${result.autoFixed.length} items automatically`));
  }

  await options?.blackboardWriter?.flushReasoningEmits?.().catch(() => {});

  return result;
}
