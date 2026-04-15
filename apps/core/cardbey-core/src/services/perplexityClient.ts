/**
 * Perplexity API client for research (Search / Sonar).
 * Uses PERPLEXITY_API_KEY and HTTPS with Authorization: Bearer <key>.
 */

const PERPLEXITY_BASE_URL = process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai';
const PERPLEXITY_CHAT_PATH = process.env.PERPLEXITY_CHAT_PATH ?? '/chat/completions';
const PERPLEXITY_DEFAULT_MODEL = process.env.PERPLEXITY_MODEL ?? 'sonar';

export interface PerplexitySource {
  title: string;
  url: string;
}

export interface PerplexityResearchResult {
  answer: string;
  sources?: PerplexitySource[];
}

export interface PerplexityResearchOptions {
  focus?: string;
}

/**
 * Call Perplexity API (Sonar) and return a simplified result.
 * On API error throws; caller should catch and handle (e.g. post failure message).
 */
export async function perplexityResearch(
  query: string,
  options?: PerplexityResearchOptions
): Promise<PerplexityResearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error('PERPLEXITY_API_KEY is not set');
  }

  const url = `${PERPLEXITY_BASE_URL.replace(/\/$/, '')}${PERPLEXITY_CHAT_PATH}`;
  const body: Record<string, unknown> = {
    model: PERPLEXITY_DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: options?.focus
          ? `Focus: ${options.focus}\n\nQuestion: ${query}`
          : query,
      },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: { message?: string }; detail?: string };
      detail = j.error?.message ?? j.detail ?? text;
    } catch {
      // keep text
    }
    throw new Error(`Perplexity API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    search_results?: Array<{ title?: string; url?: string }>;
  };

  const answer =
    data.choices?.[0]?.message?.content?.trim() ??
    'No answer returned.';

  const sources: PerplexitySource[] = [];
  if (Array.isArray(data.search_results)) {
    for (const r of data.search_results) {
      if (r?.url) {
        sources.push({
          title: typeof r.title === 'string' ? r.title : r.url,
          url: r.url,
        });
      }
    }
  }

  return { answer, sources: sources.length ? sources : undefined };
}
