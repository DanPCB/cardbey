/**
 * Phase 4 — suggest reusable capabilities from repeated resource patterns.
 * Human approval required — never auto-creates capabilities.
 */

import { listLearningEvents } from './learningEngine.js';
import { listResourceKits } from './resourceKits.js';

/** @type {Map<string, object>} */
const suggestions = new Map();

export function resetCapabilitySuggestionsForTests() {
  suggestions.clear();
}

/**
 * Detect repeated multi-slot reuse and propose a Capability draft suggestion.
 */
export function suggestCapabilitiesFromPatterns(input = {}) {
  const events = listLearningEvents({ limit: 200 });
  const reuseByIndustry = new Map();

  for (const e of events) {
    if (e.type !== 'reuse_success' && e.signal !== 'search_completed') continue;
    const industry = e.industry || e.payload?.industry || input.industry || 'general';
    if (!reuseByIndustry.has(industry)) reuseByIndustry.set(industry, []);
    reuseByIndustry.get(industry).push(e);
  }

  const out = [];
  for (const [industry, rows] of reuseByIndustry.entries()) {
    if (rows.length < 3 && !input.force) continue;
    const kits = listResourceKits({ industry, limit: 5 });
    const id = `capsug_${industry}`;
    const suggestion = {
      id,
      name: industryTitle(industry) + ' Launch Kit',
      industry,
      status: 'SUGGESTED',
      requiresHumanApproval: true,
      autoCreate: false,
      patternEvidence: {
        reuseEvents: rows.length,
        kitsObserved: kits.length,
        slots: ['hero', 'qr', 'menu', 'social', 'playlist', 'promotion'],
      },
      proposedComponents: [
        { role: 'hero', required: true },
        { role: 'qr', required: false },
        { role: 'menu', required: false },
        { role: 'social', required: true },
        { role: 'playlist', required: true },
        { role: 'promotion', required: true },
      ],
      message: 'Create reusable capability? Human approval required.',
      createdAt: new Date().toISOString(),
      authority: 'uri_capability_pattern_suggest',
    };
    suggestions.set(id, suggestion);
    out.push(suggestion);
  }

  // Always offer French Café style example when food-drink present
  if (input.industry === 'food-drink' || reuseByIndustry.has('food-drink')) {
    const id = 'capsug_restaurant_launch';
    const suggestion = {
      id,
      name: 'Restaurant Launch Kit',
      industry: 'food-drink',
      status: 'SUGGESTED',
      requiresHumanApproval: true,
      autoCreate: false,
      proposedComponents: [
        { role: 'hero', required: true },
        { role: 'qr', required: false },
        { role: 'menu', required: true },
        { role: 'social', required: true },
        { role: 'playlist', required: true },
        { role: 'promotion', required: true },
      ],
      message: 'Create reusable capability? Human approval required.',
      createdAt: new Date().toISOString(),
      authority: 'uri_capability_pattern_suggest',
    };
    suggestions.set(id, suggestion);
    out.push(suggestion);
  }

  return {
    ok: true,
    suggestions: out,
    note: 'Suggestions only — Capability Engine create requires explicit human approval',
  };
}

export function approveCapabilitySuggestion(suggestionId, { confirm = false, approverUserId } = {}) {
  const s = suggestions.get(suggestionId);
  if (!s) return { ok: false, error: 'suggestion_not_found' };
  if (!confirm) return { ok: false, error: 'confirmation_required' };
  s.status = 'APPROVED_PENDING_CAPABILITY_ENGINE';
  s.approvedAt = new Date().toISOString();
  s.approverUserId = approverUserId || null;
  suggestions.set(suggestionId, s);
  return {
    ok: true,
    suggestion: s,
    next: {
      capabilityEngine: 'POST /api/capability-engine/... (human-driven)',
      autoExecuted: false,
    },
  };
}

function industryTitle(industry) {
  return String(industry || 'Business')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
