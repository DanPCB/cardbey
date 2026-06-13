/**
 * Routes UI publish actions through hybridRouter for unified governance + audit.
 */

import hybridRouter from './hybridRouter.js';
import { normalizeRoutingBodyFlags } from './compatibilityLayer.js';

/** UI runtime actions that publish through hybrid routing. */
export const HYBRID_UI_PUBLISH_ACTIONS = new Set(['publish_store', 'publish_cardbey']);

const ACTION_OPERATION = {
  publish_store: 'publish_store',
  publish_cardbey: 'publish_mini_website',
};

const ACTION_PATH = {
  publish_store: '/api/stores/publish',
  publish_cardbey: '/api/mini-website/publish/cardbey',
};

/**
 * @param {Record<string, unknown>} payload
 */
export function extractHybridFlagsFromPayload(payload) {
  const body = normalizeRoutingBodyFlags(payload || {});
  const {
    _preferAgent,
    _forcePath,
    confirmed,
    _confirmed,
    confirmationState,
    _executeAfterReview,
    ...operationPayload
  } = body;

  return {
    hybridBody: {
      ...(_preferAgent !== undefined ? { _preferAgent } : {}),
      ...(_forcePath !== undefined ? { _forcePath } : {}),
      ...(confirmed !== undefined ? { confirmed } : {}),
      ...(_confirmed !== undefined ? { _confirmed } : {}),
      ...(confirmationState !== undefined ? { confirmationState } : {}),
      ...(_executeAfterReview !== undefined ? { _executeAfterReview } : {}),
    },
    operationPayload,
  };
}

function createCaptureResponse() {
  let statusCode = 200;
  let body = null;
  let headersSent = false;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      body = payload;
      headersSent = true;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headersSent() {
      return headersSent;
    },
  };

  return res;
}

/**
 * Execute a publish adapter through hybridRouter (direct or agent path).
 *
 * @param {object} args
 * @param {'publish_store'|'publish_cardbey'} args.action
 * @param {Record<string, unknown>} args.payload
 * @param {string|null|undefined} args.userId
 * @param {object|null|undefined} args.user
 * @param {() => Promise<Record<string, unknown>>} args.directExecute
 */
export async function executePublishThroughHybridRouter(args) {
  const { action, payload, userId, user, directExecute } = args;
  const { hybridBody, operationPayload } = extractHybridFlagsFromPayload(payload || {});
  const path = ACTION_PATH[action] || '/api/stores/publish';
  const operation = ACTION_OPERATION[action] || 'publish_store';

  const req = {
    body: { ...operationPayload, ...hybridBody },
    method: 'POST',
    path,
    originalUrl: path,
    params: {},
    user: user ?? (userId ? { id: userId } : null),
    userId: userId ?? user?.id ?? null,
  };

  const res = createCaptureResponse();

  await hybridRouter.route(
    req,
    res,
    async () => {
      const output = await directExecute(operationPayload);
      if (output && typeof output === 'object') {
        res.json({ ok: true, ...output });
      } else {
        res.json({ ok: true, output });
      }
    },
    { operation },
  );

  if (!res.headersSent || !res.body) {
    return {
      ok: false,
      status: 'failed',
      error: { code: 'hybrid_publish_empty', message: 'Hybrid publish returned no response' },
    };
  }

  const body = res.body;

  if (body.agentReviewed && Array.isArray(body.suggestions) && body.suggestions.length > 0 && !body.url && !body.storefrontUrl && !body.publishedStoreId && !body.storeId) {
    return {
      ok: body.ok !== false,
      status: 'review_complete',
      agentReviewed: true,
      agentAssisted: body.agentAssisted === true,
      suggestions: body.suggestions,
      confirmationRequired: body.confirmationRequired === true,
      review: body.review ?? null,
      message: body.message ?? null,
    };
  }

  if (res.statusCode >= 400 || body.ok === false) {
    return {
      ok: false,
      status: body.confirmationRequired ? 'confirmation_required' : 'failed',
      error: {
        code: body.error || 'hybrid_publish_failed',
        message: body.message || 'Publish failed',
      },
      agentReviewed: body.agentReviewed,
      agentAssisted: body.agentAssisted,
      suggestions: body.suggestions,
      confirmationRequired: body.confirmationRequired,
    };
  }

  return {
    ok: true,
    status: 'completed',
    output: body,
    agentReviewed: body.agentReviewed === true,
    agentAssisted: body.agentAssisted === true,
    suggestions: body.suggestions,
  };
}
