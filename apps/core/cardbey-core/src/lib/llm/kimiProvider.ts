/**
 * Kimi K2.5 LLM provider (OpenAI-compatible API).
 * Env: KIMI_API_KEY, KIMI_BASE_URL (optional), KIMI_DISABLED (kill switch).
 * Timeouts and retry for 429 / 5xx.
 */

const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2.5';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function getEnv(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function isDisabled(): boolean {
  const v = getEnv('KIMI_DISABLED');
  return v === '1' || v === 'true' || v === 'yes';
}

export interface GenerateTextOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export interface GenerateTextResult {
  text: string;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {}
): Promise<GenerateTextResult> {
  if (isDisabled()) {
    throw new Error('KIMI_DISABLED: Kimi provider is disabled');
  }
  const apiKey = getEnv('KIMI_API_KEY');
  if (!apiKey?.trim()) {
    throw new Error('KIMI_API_KEY is not set');
  }

  const baseUrl = (getEnv('KIMI_BASE_URL') || DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${baseUrl}/chat/completions`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user' as const, content: prompt }],
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text =
          data?.choices?.[0]?.message?.content ?? '';
        return {
          text,
          model: data?.model ?? DEFAULT_MODEL,
          usage: data?.usage,
        };
      }

      const status = res.status;
      if (isRetryableStatus(status) && attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
        lastError = new Error(`Kimi API ${status}: ${await res.text().catch(() => '')}`);
        continue;
      }

      const body = await res.text().catch(() => '');
      throw new Error(`Kimi API error ${status}: ${body}`);
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      if ((lastError as Error).name === 'AbortError' && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Kimi generateText failed after retries');
}

export async function health(): Promise<{
  ok: boolean;
  disabled?: boolean;
  error?: string;
}> {
  if (isDisabled()) {
    return { ok: false, disabled: true, error: 'KIMI_DISABLED' };
  }
  if (!getEnv('KIMI_API_KEY')?.trim()) {
    return { ok: false, error: 'KIMI_API_KEY not set' };
  }
  try {
    await generateText('Hi', { timeoutMs: 5000, maxRetries: 0 });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const kimiProvider = {
  name: 'kimi',
  generateText,
  health,
};
