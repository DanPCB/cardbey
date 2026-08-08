/**
 * Endpoint registry — mount-prefix and explicit path overrides for intent routing.
 * Longest prefix wins. Falls back to CATEGORY_RULES pattern matching.
 */

import {
  CATEGORY_RULES,
  executionPathForCategory,
} from './endpointCategories.js';

/**
 * Mount-prefix rules (ordered longest-first at runtime).
 * @type {Array<{ prefix: string, category: import('./endpointCategories.js').IntentCategory, note?: string }>}
 */
export const MOUNT_PREFIX_RULES = [
  // Agent OS pipeline
  { prefix: '/api/performer/intake/v2', category: 'AGENT_WORKFLOW', note: 'Canonical performer intake' },
  { prefix: '/api/performer/intake', category: 'AGENT_WORKFLOW', note: 'Deprecated v1 shim (forwards to v2)' },
  { prefix: '/api/performer/proactive-step', category: 'AGENT_WORKFLOW', note: 'Proactive mission steps' },
  { prefix: '/api/performer/runtime', category: 'AGENT_WORKFLOW', note: 'Runtime kernel actions' },
  { prefix: '/api/performer/missions', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/performer/design', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/runtime/missions', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/runtime/session', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/runtime/capabilities', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/runtime/target', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/runtime', category: 'AGENT_WORKFLOW', note: 'Runtime diagnostics' },
  { prefix: '/api/orchestrator', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/ai-operator', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/intent-graph', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/passive-generation', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/tools', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/watcher', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/conversations', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/agent-chat', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/assistant', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/rag', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/agents/researcher', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/automation', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/campaign', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/vision', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/intelligence', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/mi', category: 'AGENT_WORKFLOW', note: 'Mission inbox / orchestrator' },
  { prefix: '/api/menu', category: 'AGENT_WORKFLOW', note: 'configure-from-photo' },
  { prefix: '/api/catalog', category: 'AGENT_WORKFLOW', note: 'SAM processing' },

  // Hybrid (governed publish / apply / schedule)
  { prefix: '/api/signage/engine', category: 'HYBRID' },
  { prefix: '/api/mini-website', category: 'HYBRID', note: 'publish/cardbey' },
  { prefix: '/api/discovery', category: 'HYBRID', note: 'generate-channel hybrid' },

  // User actions
  { prefix: '/api/auth', category: 'USER_ACTION' },
  { prefix: '/api/users/me', category: 'USER_ACTION' },
  { prefix: '/api/oauth', category: 'USER_ACTION' },
  { prefix: '/api/notifications', category: 'USER_ACTION' },

  // Content CRUD
  { prefix: '/api/draft-store', category: 'CONTENT_CRUD' },
  { prefix: '/api/store-draft', category: 'CONTENT_CRUD' },
  { prefix: '/api/upload', category: 'CONTENT_CRUD' },
  { prefix: '/api/uploads', category: 'CONTENT_CRUD' },
  { prefix: '/api/products', category: 'CONTENT_CRUD' },
  { prefix: '/api/contents', category: 'CONTENT_CRUD' },
  { prefix: '/api/content-library', category: 'CONTENT_CRUD' },
  { prefix: '/api/universal-library', category: 'SOCIAL', note: 'Universal Library reads + governed writes' },
  { prefix: '/api/assets', category: 'CONTENT_CRUD' },
  { prefix: '/api/docs', category: 'CONTENT_CRUD' },
  { prefix: '/api/suitcase', category: 'CONTENT_CRUD' },
  { prefix: '/api/cards', category: 'CONTENT_CRUD' },
  { prefix: '/api/creative-templates', category: 'CONTENT_CRUD' },
  { prefix: '/api/greeting-cards', category: 'CONTENT_CRUD' },
  { prefix: '/api/playlists', category: 'CONTENT_CRUD' },
  { prefix: '/api/artifacts', category: 'CONTENT_CRUD' },
  { prefix: '/api/media', category: 'CONTENT_CRUD' },

  // Social
  { prefix: '/api/public/content-interactions', category: 'SOCIAL' },
  { prefix: '/api/social', category: 'SOCIAL' },
  { prefix: '/api/threads', category: 'SOCIAL' },
  { prefix: '/api/chat/threads', category: 'SOCIAL' },

  // Transactions
  { prefix: '/api/billing', category: 'TRANSACTION' },
  { prefix: '/api/promo/engine', category: 'TRANSACTION' },
  { prefix: '/api/loyalty', category: 'TRANSACTION' },
  { prefix: '/api/reward', category: 'TRANSACTION' },
  { prefix: '/api/promos', category: 'TRANSACTION' },
  { prefix: '/api/promotions', category: 'TRANSACTION' },

  // Observe (PIL / telemetry — no agent execution)
  { prefix: '/api/pil/events', category: 'OBSERVE' },
  { prefix: '/api/pil', category: 'OBSERVE' },
  { prefix: '/api/telemetry', category: 'OBSERVE' },

  // Read-only public
  { prefix: '/api/public-feed', category: 'READ_ONLY' },
  { prefix: '/api/public/store-engagement', category: 'SOCIAL' },
  { prefix: '/api/public/content-interactions', category: 'SOCIAL' },
  { prefix: '/api/public', category: 'READ_ONLY' },
  { prefix: '/api/storefront', category: 'READ_ONLY' },
  { prefix: '/api/health', category: 'READ_ONLY' },

  // Admin / ops
  { prefix: '/api/admin', category: 'ADMIN' },
  { prefix: '/api/self-healing', category: 'ADMIN' },
  { prefix: '/api/control-tower', category: 'ADMIN' },
  { prefix: '/api/ops', category: 'ADMIN' },
  { prefix: '/api/internal', category: 'ADMIN' },

  // Broad mounts (lower priority — may contain hybrid subpaths)
  { prefix: '/api/missions', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/stores', category: 'CONTENT_CRUD', note: 'store CRUD; publish paths overridden below' },
  { prefix: '/api/explore', category: 'CONTENT_CRUD', note: 'video admin CRUD' },
  { prefix: '/api/device', category: 'CONTENT_CRUD', note: 'device pairing CRUD' },
  { prefix: '/api/signage', category: 'CONTENT_CRUD' },
  { prefix: '/api/broker', category: 'READ_ONLY', note: 'capability discovery GET' },
  { prefix: '/api/ai', category: 'AGENT_WORKFLOW' },
  { prefix: '/api/business', category: 'CONTENT_CRUD' },
  { prefix: '/api/store', category: 'CONTENT_CRUD' },
  { prefix: '/api/journeys', category: 'CONTENT_CRUD' },
  { prefix: '/api/smart-objects', category: 'CONTENT_CRUD' },
  { prefix: '/api/qr', category: 'CONTENT_CRUD' },
  { prefix: '/api/screens', category: 'CONTENT_CRUD' },
  { prefix: '/api/player', category: 'CONTENT_CRUD' },
  { prefix: '/api/system', category: 'ADMIN' },
  { prefix: '/api/dev', category: 'ADMIN' },
  { prefix: '/api/debug', category: 'ADMIN' },
];

/** Hybrid path keywords — upgrade mount category when matched. */
const HYBRID_PATH_REGEX = /\/(publish|commit|generate-channel|apply-|build-playlist|approve|reject|moderate|archive|restore|schedule)(\/|$)/i;

/** Destructive methods default to hybrid when path is ambiguous. */
const HYBRID_PATCH_REGEX = /\/(approve|reject|moderate|archive|restore|schedule)(\/|$)/i;

const sortedPrefixRules = [...MOUNT_PREFIX_RULES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

const compiledPatternRules = Object.entries(CATEGORY_RULES).map(([category, patterns]) => ({
  category,
  regex: new RegExp(patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i'),
}));

/**
 * @param {string} endpoint - Full path e.g. /api/stores/abc/publish
 * @param {string} [method='GET']
 * @param {object} [body={}]
 * @returns {{ category: import('./endpointCategories.js').IntentCategory, executionPath: import('./endpointCategories.js').ExecutionPath, reason: string }}
 */
export function categorizeEndpoint(endpoint, method = 'GET', body = {}) {
  const path = normalizePath(endpoint);
  const httpMethod = String(method || 'GET').toUpperCase();

  const forced = resolveForcePath(body);
  if (forced) {
    return {
      category: forced.category,
      executionPath: forced.executionPath,
      reason: forced.reason,
    };
  }

  let matched = null;

  for (const rule of sortedPrefixRules) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      matched = {
        category: rule.category,
        executionPath: executionPathForCategory(rule.category),
        reason: rule.note ? `mount:${rule.note}` : `mount:${rule.prefix}`,
      };
      break;
    }
  }

  if (!matched) {
    for (const { category, regex } of compiledPatternRules) {
      if (regex.test(path)) {
        matched = {
          category,
          executionPath: executionPathForCategory(category),
          reason: 'pattern_match',
        };
        break;
      }
    }
  }

  if (matched && shouldUpgradeToHybrid(path, httpMethod)) {
    return {
      category: 'HYBRID',
      executionPath: executionPathForCategory('HYBRID'),
      reason: 'hybrid_path_upgrade',
    };
  }

  if (matched) return matched;

  if (httpMethod === 'GET') {
    return {
      category: 'READ_ONLY',
      executionPath: executionPathForCategory('READ_ONLY'),
      reason: 'get_default_read_only',
    };
  }

  if (httpMethod === 'DELETE') {
    return {
      category: 'HYBRID',
      executionPath: executionPathForCategory('HYBRID'),
      reason: 'delete_default_hybrid',
    };
  }

  return {
    category: 'UNKNOWN',
    executionPath: 'direct',
    reason: 'unknown_default_direct',
  };
}

/**
 * @param {string} path
 * @param {string} httpMethod
 */
function shouldUpgradeToHybrid(path, httpMethod) {
  if (HYBRID_PATH_REGEX.test(path)) return true;
  if (httpMethod === 'PATCH' && HYBRID_PATCH_REGEX.test(path)) return true;
  if (httpMethod === 'DELETE' && !path.includes('/dev/') && !path.includes('/debug/')) {
    return HYBRID_PATH_REGEX.test(path) || /\/(draft-store|store-draft|docs|products|contents)\//i.test(path);
  }
  return false;
}

/**
 * @param {object} body
 */
function resolveForcePath(body) {
  if (!body || typeof body !== 'object') return null;

  if (body._forcePath === 'direct') {
    return { category: 'USER_ACTION', executionPath: 'direct', reason: 'force:direct' };
  }
  if (body._forcePath === 'kernel' || body._forcePath === 'agent') {
    return { category: 'AGENT_WORKFLOW', executionPath: 'kernel', reason: 'force:kernel' };
  }
  if (body._forcePath === 'hybrid') {
    return { category: 'HYBRID', executionPath: 'hybrid', reason: 'force:hybrid' };
  }

  if (body._preferAgent === true) {
    return { category: 'AGENT_WORKFLOW', executionPath: 'kernel', reason: 'preferAgent:true' };
  }
  if (body._preferAgent === false) {
    return { category: 'USER_ACTION', executionPath: 'direct', reason: 'preferAgent:false' };
  }

  return null;
}

/** @param {string} path */
export function normalizePath(path) {
  const raw = String(path || '').split('?')[0];
  if (!raw.startsWith('/')) return `/api/${raw.replace(/^\/+/, '')}`;
  return raw.replace(/\/+$/, '') || '/';
}

export function getMountPrefixRules() {
  return sortedPrefixRules;
}

export function getCategoryPatternRules() {
  return compiledPatternRules;
}
