import { runMiniWebsiteAgent } from '../../agents/miniWebsiteAgent.ts';

function pickString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function parseHeroTextFromIntent(userIntent) {
  const raw = String(userIntent || '');
  if (!raw.trim()) return { headline: '', subheadline: '' };

  const headlineMatch =
    raw.match(/\bheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
    raw.match(/\bheadline\b[^\\n]*to\\s+([^\\n.]+)/i);
  const subheadlineMatch =
    raw.match(/\bsubheadline\b[^"'\\n]*["']([^"']+)["']/i) ||
    raw.match(/\bsubheadline\b[^\\n]*to\\s+([^\\n.]+)/i);

  const headline = headlineMatch && headlineMatch[1] ? String(headlineMatch[1]).trim() : '';
  const subheadline = subheadlineMatch && subheadlineMatch[1] ? String(subheadlineMatch[1]).trim() : '';
  return { headline, subheadline };
}

export async function execute(input, context) {
  const missionId = context?.mission?.id ?? context?.missionId ?? '';
  const storeId = input?.storeId ?? context?.mission?.metadataJson?.storeId ?? '';
  const tenantId = context?.mission?.userId ?? context?.tenantId ?? '';
  const threadId = context?.mission?.metadataJson?.threadId ?? undefined;
  const userIntent = pickString(
    input?.userIntent,
    input?.goal,
    input?.intent,
    input?.prompt,
    context?.mission?.metadataJson?.userPrompt,
    context?.mission?.metadata?.userPrompt,
  );
  const currentSections = input?.currentSections ?? [];
  const currentTheme = input?.currentTheme ?? null;

  // Deterministic fallback: hero headline/subheadline edits can be patched without LLM.
  const { headline, subheadline } = parseHeroTextFromIntent(userIntent);
  const deterministicPatches =
    headline || subheadline
      ? [
          {
            type: 'hero',
            content: {
              ...(headline ? { headline } : {}),
              ...(subheadline ? { subheadline } : {}),
            },
          },
        ]
      : null;

  const result = await runMiniWebsiteAgent({
    role: 'editor',
    missionId,
    tenantId,
    storeId,
    userIntent,
    currentSections,
    currentTheme,
    threadId,
  });

  return {
    status: result.ok ? 'ok' : deterministicPatches ? 'ok' : 'failed',
    output: {
      patches: result.ok ? (result.patches ?? []) : deterministicPatches ?? [],
      theme: result.ok ? (result.theme ?? null) : null,
      storeName: result.storeName ?? '',
      slug: result.slug ?? '',
      error: result.error,
      ...(deterministicPatches && !result.ok
        ? { fallback: { used: true, reason: 'miniWebsiteAgent_failed_or_unavailable' } }
        : {}),
    },
  };
}
