/**
 * Validate DeepSeek API key + cloud endpoint (no secrets printed in full).
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/deepseekKeyValidation.mjs
 */

import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function resolveBaseUrl() {
  const base = process.env.DEEPSEEK_BASE_URL?.trim();
  const endpoint = process.env.DEEPSEEK_ENDPOINT?.trim();
  if (base) {
    return base.replace(/\/+$/, '').endsWith('/v1')
      ? base.replace(/\/+$/, '')
      : `${base.replace(/\/+$/, '')}/v1`;
  }
  if (endpoint && !/localhost|127\.0\.0\.1/i.test(endpoint)) {
    return endpoint.replace(/\/+$/, '');
  }
  return 'https://api.deepseek.com/v1';
}

function resolveModel() {
  const raw = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash';
  // Local HF-style ids are invalid on DeepSeek cloud.
  if (raw.includes('/') || /localhost/i.test(raw)) return 'deepseek-v4-flash';
  return raw;
}

async function validate() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim() || '';
  const baseURL = resolveBaseUrl();
  const model = resolveModel();
  const endpointEnv = process.env.DEEPSEEK_ENDPOINT?.trim() || '';
  const baseEnv = process.env.DEEPSEEK_BASE_URL?.trim() || '';

  console.log('[DEEPSEEK-VALIDATE]', {
    keyPrefix: apiKey ? `${apiKey.slice(0, 7)}…` : '(missing)',
    keySuffix: apiKey ? `…${apiKey.slice(-4)}` : '',
    keyLength: apiKey.length,
    DEEPSEEK_ENDPOINT: endpointEnv || '(unset)',
    DEEPSEEK_BASE_URL: baseEnv || '(unset)',
    resolvedBaseURL: baseURL,
    modelEnv: process.env.DEEPSEEK_MODEL?.trim() || '(unset)',
    resolvedModel: model,
    endpointIsLocalhost: /localhost|127\.0\.0\.1/i.test(endpointEnv),
  });

  if (!apiKey || apiKey.length < 20) {
    console.error('[DEEPSEEK-VALIDATE] FAIL: API key missing or too short');
    process.exitCode = 1;
    return;
  }

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      console.log('[DEEPSEEK-VALIDATE] OK: key accepted', {
        status: response.status,
        model: data.model ?? model,
      });
      process.exitCode = 0;
      return;
    }
    console.error('[DEEPSEEK-VALIDATE] FAIL:', {
      status: response.status,
      message: data?.error?.message || data?.message || JSON.stringify(data).slice(0, 200),
    });
    process.exitCode = 1;
  } catch (err) {
    console.error('[DEEPSEEK-VALIDATE] FAIL: network', err?.message || err);
    process.exitCode = 1;
  }
}

await validate();
