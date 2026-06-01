/**
 * Dynamic agent module loader — never crashes the process on missing optional agents.
 */

import { V1OrchestrationAgent } from './agents/baseAgent.js';

const DEV = process.env.NODE_ENV !== 'production';

/** @type {Record<string, { path: string, exportName: string }>} */
export const AGENT_MODULE_MAP = {
  research: { path: './agents/researchAgent.js', exportName: 'ResearchAgent' },
  build: { path: './agents/buildAgent.js', exportName: 'BuildAgent' },
  qa: { path: './agents/qaAgent.js', exportName: 'QAAgent' },
  action: { path: './agents/actionAgent.js', exportName: 'ActionAgent' },
  brief: { path: './agents/briefAgent.js', exportName: 'BriefAgent' },
  graphics: { path: './agents/graphicsAgent.js', exportName: 'GraphicsAgent' },
  slideshow: { path: './agents/slideshowAgent.js', exportName: 'SlideshowAgent' },
  copy: { path: './agents/copyAgent.js', exportName: 'CopyAgent' },
  package: { path: './agents/packageAgent.js', exportName: 'PackageAgent' },
  catalog: { path: './agents/catalogAgent.js', exportName: 'CatalogAgent' },
  media: { path: './agents/mediaAgent.js', exportName: 'MediaAgent' },
};

/** @type {Map<string, typeof V1OrchestrationAgent>} */
const classCache = new Map();

/** @type {Map<string, typeof V1OrchestrationAgent>} */
const fallbackCache = new Map();

function makeFallbackClass(agentType) {
  if (fallbackCache.has(agentType)) return fallbackCache.get(agentType);
  const Fallback = class extends V1OrchestrationAgent {
    static agentType = agentType;

    static agentName = agentType;
  };
  fallbackCache.set(agentType, Fallback);
  return Fallback;
}

/**
 * @param {string} agentType
 * @returns {Promise<typeof V1OrchestrationAgent>}
 */
export async function loadAgentClass(agentType) {
  const key = String(agentType || 'research').trim() || 'research';
  if (classCache.has(key)) return classCache.get(key);

  const spec = AGENT_MODULE_MAP[key] ?? AGENT_MODULE_MAP.research;
  try {
    const mod = await import(spec.path);
    const Cls = mod[spec.exportName];
    if (typeof Cls !== 'function') {
      throw new Error(`export ${spec.exportName} missing in ${spec.path}`);
    }
    classCache.set(key, Cls);
    return Cls;
  } catch (e) {
    if (DEV) {
      console.warn(
        `[agent-stub] loadAgentClass fallback for "${key}":`,
        e?.message || e,
      );
    }
    const Fallback = makeFallbackClass(key);
    classCache.set(key, Fallback);
    return Fallback;
  }
}

/** Preload all coordinator-required agents (for tests / warm boot). */
export async function preloadCoordinatorAgents() {
  const types = [
    'research',
    'build',
    'qa',
    'action',
    'brief',
    'graphics',
    'slideshow',
    'copy',
    'package',
  ];
  await Promise.all(types.map((t) => loadAgentClass(t)));
}

export function clearAgentClassCacheForTests() {
  classCache.clear();
  fallbackCache.clear();
}
