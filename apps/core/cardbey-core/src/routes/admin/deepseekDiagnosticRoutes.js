/**
 * Admin DeepSeek connectivity diagnostic (no full API key in responses).
 * GET /api/admin/deepseek-diagnostic
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
  isDeepSeekCloudConfigured,
  resolveDeepSeekApiKey,
  resolveDeepSeekBaseUrl,
  resolveDeepSeekModel,
} from '../../lib/llm/deepseekEnv.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get('/deepseek-diagnostic', async (_req, res) => {
  const apiKey = resolveDeepSeekApiKey();
  const baseURL = resolveDeepSeekBaseUrl();
  const model = resolveDeepSeekModel();
  const results = {
    environment: {
      DEEPSEEK_API_KEY_SET: Boolean(apiKey),
      DEEPSEEK_API_KEY_PREFIX: apiKey ? `${apiKey.slice(0, 8)}…` : null,
      DEEPSEEK_API_KEY_LENGTH: apiKey.length,
      DEEPSEEK_BASE_URL: baseURL,
      DEEPSEEK_MODEL: model,
      DEEPSEEK_ENABLED: isDeepSeekCloudConfigured(),
      DEEPSEEK_ENDPOINT_SET: Boolean(process.env.DEEPSEEK_ENDPOINT?.trim()),
      DEEPSEEK_ENDPOINT_IS_LOCAL: /localhost|127\.0\.0\.1/i.test(
        process.env.DEEPSEEK_ENDPOINT || '',
      ),
    },
    test: {
      status: 'pending',
      result: null,
    },
  };

  if (!apiKey) {
    results.test.status = 'failed';
    results.test.result = { error: 'DEEPSEEK_API_KEY not set' };
    return res.json(results);
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
    results.test.status = response.status === 200 ? 'success' : 'failed';
    results.test.result = {
      status: response.status,
      ok: response.ok,
      message: data?.error?.message || (response.ok ? 'success' : 'request_failed'),
    };
  } catch (error) {
    results.test.status = 'error';
    results.test.result = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return res.json(results);
});

export default router;
