/**
 * Shared DeepSeek cloud env resolution for gateway + multi-agent config.
 * Prefer DEEPSEEK_BASE_URL; ignore localhost DEEPSEEK_ENDPOINT (local adapter only).
 */

function isLocalLlmUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

export function resolveDeepSeekApiKey(): string {
  return String(process.env.DEEPSEEK_API_KEY ?? '').trim();
}

/** OpenAI-compatible base URL ending in /v1. */
export function resolveDeepSeekBaseUrl(): string {
  const base = process.env.DEEPSEEK_BASE_URL?.trim() || '';
  const endpoint = process.env.DEEPSEEK_ENDPOINT?.trim() || '';
  const picked =
    base ||
    (endpoint && !isLocalLlmUrl(endpoint) ? endpoint : '') ||
    'https://api.deepseek.com/v1';
  const trimmed = picked.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1') || trimmed.includes('/anthropic')) return trimmed;
  return `${trimmed}/v1`;
}

/**
 * Cloud model id. Rejects local HF-style paths left in .env for local servers.
 */
export function resolveDeepSeekModel(preferred?: string | null): string {
  const raw = String(preferred ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash').trim();
  if (!raw || raw.includes('/') || /DeepSeek-V2-Lite/i.test(raw)) {
    return 'deepseek-v4-flash';
  }
  return raw;
}

export function isDeepSeekCloudConfigured(): boolean {
  const key = resolveDeepSeekApiKey();
  const enabled = String(process.env.DEEPSEEK_ENABLED ?? 'true')
    .trim()
    .toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'off') return false;
  return Boolean(key) && key.startsWith('sk-') && key.length >= 20;
}
