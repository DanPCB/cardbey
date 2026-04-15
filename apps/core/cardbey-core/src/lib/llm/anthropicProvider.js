/**
 * Anthropic Claude provider (messages API).
 * Env:
 * - ANTHROPIC_API_KEY (required)
 * - ANTHROPIC_MODEL (optional, default 'claude-3-5-sonnet-20240620')
 * - ANTHROPIC_DISABLED=1 to kill-switch
 */

import https from 'https';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620';
const ANTHROPIC_DISABLED = process.env.ANTHROPIC_DISABLED === '1';

/**
 * Normalized generateText interface.
 * Supports both:
 *   generateText(prompt, { systemPrompt?, maxTokens? })
 * and
 *   generateText({ prompt, systemPrompt?, maxTokens? })
 *
 * @param {string|{ prompt: string, systemPrompt?: string, maxTokens?: number, model?: string }} promptOrOptions
 * @param {{ systemPrompt?: string, maxTokens?: number, model?: string }} [maybeOptions]
 * @returns {Promise<{ text: string | null, error?: string, tokensIn: number, tokensOut: number }>}
 */
export async function generateText(promptOrOptions, maybeOptions) {
  let prompt = '';
  let systemPrompt = '';
  let maxTokens = 1000;
  let model = ANTHROPIC_MODEL;

  if (typeof promptOrOptions === 'string') {
    prompt = promptOrOptions;
    systemPrompt =
      (maybeOptions && typeof maybeOptions.systemPrompt === 'string'
        ? maybeOptions.systemPrompt
        : '') || '';
    if (
      maybeOptions &&
      typeof maybeOptions.maxTokens === 'number' &&
      Number.isFinite(maybeOptions.maxTokens)
    ) {
      maxTokens = maybeOptions.maxTokens;
    }
    if (maybeOptions && typeof maybeOptions.model === 'string' && maybeOptions.model) {
      model = maybeOptions.model;
    }
  } else {
    const opts = promptOrOptions || {};
    prompt = typeof opts.prompt === 'string' ? opts.prompt : '';
    systemPrompt =
      (typeof opts.systemPrompt === 'string' ? opts.systemPrompt : '') || '';
    if (
      typeof opts.maxTokens === 'number' &&
      Number.isFinite(opts.maxTokens)
    ) {
      maxTokens = opts.maxTokens;
    }
    if (typeof opts.model === 'string' && opts.model) {
      model = opts.model;
    }
  }

  if (!prompt || ANTHROPIC_DISABLED || !ANTHROPIC_API_KEY) {
    return {
      text: null,
      error: !ANTHROPIC_API_KEY ? 'NO_API_KEY' : 'ANTHROPIC_DISABLED',
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (parsed.error) {
              console.error('[AnthropicProvider]', parsed.error);
              resolve({
                text: null,
                error: parsed.error.type || 'API_ERROR',
                tokensIn: 0,
                tokensOut: 0,
              });
              return;
            }
            const text =
              parsed.content && Array.isArray(parsed.content)
                ? parsed.content[0]?.text ?? null
                : null;
            resolve({
              text,
              tokensIn: parsed.usage?.input_tokens ?? 0,
              tokensOut: parsed.usage?.output_tokens ?? 0,
            });
          } catch (err) {
            console.error('[AnthropicProvider] parse error:', err);
            resolve({
              text: null,
              error: 'PARSE_ERROR',
              tokensIn: 0,
              tokensOut: 0,
            });
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error('[AnthropicProvider] request error:', err.message);
      resolve({
        text: null,
        error: 'REQUEST_ERROR',
        tokensIn: 0,
        tokensOut: 0,
      });
    });
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        text: null,
        error: 'TIMEOUT',
        tokensIn: 0,
        tokensOut: 0,
      });
    });
    req.write(body);
    req.end();
  });
}

/**
 * POST /v1/messages with a full JSON body (supports multimodal content blocks).
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ content?: Array<{ type?: string, text?: string }>, error?: string, usage?: object }>}
 */
export async function postAnthropicMessages(payload) {
  if (ANTHROPIC_DISABLED || !ANTHROPIC_API_KEY) {
    return {
      error: !ANTHROPIC_API_KEY ? 'NO_API_KEY' : 'ANTHROPIC_DISABLED',
    };
  }

  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (parsed.error) {
              console.error('[AnthropicProvider] messages API', parsed.error);
              resolve({
                error: parsed.error.type || 'API_ERROR',
              });
              return;
            }
            resolve(parsed);
          } catch (err) {
            console.error('[AnthropicProvider] messages parse error', err);
            resolve({ error: 'PARSE_ERROR' });
          }
        });
      },
    );
    req.on('error', (err) => {
      console.error('[AnthropicProvider] messages request error', err.message);
      resolve({ error: 'REQUEST_ERROR' });
    });
    req.setTimeout(120000, () => {
      req.destroy();
      resolve({ error: 'TIMEOUT' });
    });
    req.write(body);
    req.end();
  });
}

export async function health() {
  if (!ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'NO_API_KEY' };
  }
  if (ANTHROPIC_DISABLED) {
    return { ok: false, reason: 'DISABLED' };
  }

  const result = await generateText({
    prompt: 'Reply with just: ok',
    systemPrompt: 'You are a health check.',
    maxTokens: 10,
  });

  return {
    ok: result.text != null,
    model: ANTHROPIC_MODEL,
    error: result.error ?? null,
  };
}

export const anthropicProvider = { generateText, postAnthropicMessages, health };
export default anthropicProvider;

