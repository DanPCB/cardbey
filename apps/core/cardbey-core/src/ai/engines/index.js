/**
 * AI Engine Registry
 * Central registry for all AI engine implementations
 * Provides getter functions to retrieve engines by name
 */

import { openaiVisionEngine } from './openaiVisionEngine.js';
import { openaiTextEngine } from './openaiTextEngine.js';
import { openaiContentEngine } from './openaiContentEngine.js';
import { openaiVideoEngine } from './openaiVideoEngine.js';

// ============================================================================
// Vision Engines Registry
// ============================================================================

export const visionEngines = {
  default: openaiVisionEngine,
  'openai-vision-v1': openaiVisionEngine,
};

export function getVisionEngine(name = 'default') {
  const engine = visionEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Vision engine "${name}" not found, using default`);
    return visionEngines.default;
  }
  return engine;
}

// ============================================================================
// Text Engines Registry
// ============================================================================

export const textEngines = {
  default: openaiTextEngine,
  'openai-text-v1': openaiTextEngine,
};

export function getTextEngine(name = 'default') {
  const engine = textEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Text engine "${name}" not found, using default`);
    return textEngines.default;
  }
  return engine;
}

// ============================================================================
// Content Engines Registry
// ============================================================================

export const contentEngines = {
  default: openaiContentEngine,
  'openai-content-v1': openaiContentEngine,
};

export function getContentEngine(name = 'default') {
  const engine = contentEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Content engine "${name}" not found, using default`);
    return contentEngines.default;
  }
  return engine;
}

// ============================================================================
// Video Engines Registry
// ============================================================================

export const videoEngines = {
  default: openaiVideoEngine,
  'openai-video-v1-placeholder': openaiVideoEngine,
};

export function getVideoEngine(name = 'default') {
  const engine = videoEngines[name];
  if (!engine) {
    console.warn(`[AI Engines] Video engine "${name}" not found, using default`);
    return videoEngines.default;
  }
  return engine;
}

// ============================================================================
// Engine Registration Helpers
// ============================================================================

/**
 * Register a new vision engine
 */
export function registerVisionEngine(name, engine) {
  visionEngines[name] = engine;
  console.log(`[AI Engines] Registered vision engine: ${name}`);
}

/**
 * Register a new text engine
 */
export function registerTextEngine(name, engine) {
  textEngines[name] = engine;
  console.log(`[AI Engines] Registered text engine: ${name}`);
}

/**
 * Register a new content engine
 */
export function registerContentEngine(name, engine) {
  contentEngines[name] = engine;
  console.log(`[AI Engines] Registered content engine: ${name}`);
}

/**
 * Register a new video engine
 */
export function registerVideoEngine(name, engine) {
  videoEngines[name] = engine;
  console.log(`[AI Engines] Registered video engine: ${name}`);
}


