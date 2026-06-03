/**
 * Turn typed resolution errors into specific planner ask prompts (no generic store picker).
 */

/**
 * @param {import('./entityResolver.js').ResolutionError[]} errors
 * @returns {{ prompt: string; missing: string[] } | null}
 */
export function buildResolutionAskFromErrors(errors) {
  const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
  if (!list.length) return null;

  const err = list[0];
  const typeLabel =
    err.entityType === 'product'
      ? 'product'
      : err.entityType === 'campaign'
        ? 'campaign'
        : 'store';

  if (err.reason === 'PRONOUN_UNRESOLVABLE') {
    return {
      prompt: `Which ${typeLabel} did you mean? I don't have a recent ${typeLabel} in context for "${err.ref}".`,
      missing: [err.entityType === 'product' ? 'productId' : 'storeId'],
    };
  }

  if (err.reason === 'AMBIGUOUS' && Array.isArray(err.candidates) && err.candidates.length > 0) {
    const bulletNames = err.candidates
      .slice(0, 8)
      .map((c) => c.name)
      .filter(Boolean)
      .map((name) => `• ${name}`)
      .join('\n');
    const namesInline = err.candidates
      .slice(0, 5)
      .map((c) => c.name)
      .filter(Boolean)
      .join(', ');
    const prompt =
      typeLabel === 'store'
        ? `Which store did you mean? I found:\n${bulletNames}`
        : `I found multiple ${typeLabel}s matching "${err.ref}". Which one should I use?\n${bulletNames}`;
    return {
      prompt: bulletNames ? prompt : `Which ${typeLabel} should I use? Options: ${namesInline}.`,
      missing: [err.entityType === 'product' ? 'productId' : 'storeId'],
    };
  }

  if (err.reason === 'NOT_FOUND') {
    const hint =
      Array.isArray(err.candidates) && err.candidates.length > 0
        ? ` I do see: ${err.candidates
            .slice(0, 3)
            .map((c) => c.name)
            .join(', ')}.`
        : '';
    return {
      prompt: `I couldn't find a ${typeLabel} matching "${err.ref}".${hint} Tell me the exact name or pick one from your stores.`,
      missing: [err.entityType === 'product' ? 'productId' : 'storeId'],
    };
  }

  return null;
}

/**
 * Format hydrated context for logging / optional LLM classifier enrichment.
 * @param {import('./memoryHydrator.js').HydratedContext} hydrated
 */
export function formatHydratedContextForPrompt(hydrated) {
  if (!hydrated || typeof hydrated !== 'object') return '';

  const lines = [];
  const store = hydrated.entities?.store;
  lines.push(
    store
      ? `Store: ${store.name || '(unnamed)'} (id: ${store.id})`
      : 'Store: not resolved',
  );
  if (hydrated.entities?.product) {
    const p = hydrated.entities.product;
    lines.push(`Product: ${p.name} (id: ${p.id})`);
  }
  if (hydrated.entities?.campaign) {
    const c = hydrated.entities.campaign;
    lines.push(`Campaign: ${c.name} (id: ${c.id})`);
  }

  const ep = hydrated.episodic ?? {};
  lines.push(`Last action: ${ep.lastAction?.toolName ?? 'none'}`);
  lines.push(`Last store touched: ${ep.lastStore?.name ?? 'none'}`);
  lines.push(`Last error: ${ep.lastError?.errorMessage ?? 'none'}`);
  lines.push(`Resolution confidence: ${hydrated.resolution?.confidence ?? 'low'}`);
  if (hydrated.resolution?.errors?.length) {
    lines.push(`Resolution issues: ${JSON.stringify(hydrated.resolution.errors)}`);
  }

  return lines.join('\n');
}
