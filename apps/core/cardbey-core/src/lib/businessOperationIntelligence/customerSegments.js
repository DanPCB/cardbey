/**
 * Customer-segment hypotheses — Phase D6.
 * Always AI_INFERENCE unless USER_DEFINED evidence exists. Never assert "your customers are X".
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { VERTICAL_ARCHETYPES } from './verticalPacks.js';

/**
 * @param {{
 *   context: object,
 *   snapshot?: object | null,
 *   vertical: object,
 * }} input
 */
export function deriveCustomerSegmentHypotheses(input) {
  const { context, snapshot, vertical } = input;
  const corpus = [
    context?.sourceText,
    context?.identity?.name,
    context?.identity?.businessType,
    context?.identity?.category,
    context?.identity?.operatingModel,
    snapshot?.digitalPresence?.description,
    ...(snapshot?.offerings?.items || []).map((i) => i.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  /** @type {{ id: string, label: string, rationale: string, knowledgeState: string }[]} */
  const segments = [];

  const push = (id, label, rationale) => {
    if (segments.some((s) => s.id === id)) return;
    segments.push({
      id,
      label,
      rationale,
      knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
      statement: `Cardbey's current evidence suggests the business may serve ${label}.`,
      limitations: 'Hypothesis only — not confirmed customer research.',
    });
  };

  const id = vertical?.id;
  if (id === VERTICAL_ARCHETYPES.HOSPITALITY || /\b(restaurant|pho|cafe|menu)\b/.test(corpus)) {
    push('local_diners', 'local diners and nearby residents', 'Menu/location language points to place-based dining.');
    if (/\bvietnamese|pho|banh\b/.test(corpus)) {
      push('cuisine_seekers', 'customers seeking Vietnamese / Southeast Asian cuisine', 'Cuisine terms appear in the concept or offerings.');
    }
  } else if (id === VERTICAL_ARCHETYPES.LOCAL_SERVICE || id === VERTICAL_ARCHETYPES.STARTUP_SERVICE) {
    if (/\bmobile|detail\b/.test(corpus)) {
      push('vehicle_owners', 'local vehicle owners needing on-site detailing', 'Mobile detailing language in the concept.');
    } else if (/\bplumb\b/.test(corpus)) {
      push('local_homeowners', 'local homeowners and property managers needing plumbing work', 'Plumbing service language.');
    } else {
      push('local_households', 'local households needing on-site service', 'Local service archetype from stated concept/type.');
    }
  } else if (id === VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE) {
    if (/\bsme|small business|accounting|tax\b/.test(corpus)) {
      push('sme_operators', 'Australian SME operators needing accounting / compliance support', 'SME/accounting language in the concept.');
    } else if (/\blegal|law\b/.test(corpus)) {
      push('business_clients', 'business clients needing legal advisory support', 'Legal service language.');
    } else {
      push('professional_clients', 'clients seeking professional advisory services', 'Professional service archetype.');
    }
  } else if (id === VERTICAL_ARCHETYPES.PRODUCT_RETAIL || id === VERTICAL_ARCHETYPES.STARTUP_PRODUCT) {
    if (/\bonline|ecommerce|e-commerce\b/.test(corpus)) {
      push('online_shoppers', 'online shoppers in the stated product category', 'Online retail language.');
    } else {
      push('product_buyers', 'retail buyers in the stated product category', 'Product/retail archetype.');
    }
  } else if (id === VERTICAL_ARCHETYPES.MANUFACTURING_B2B) {
    push('wholesale_buyers', 'wholesale, import, or business buyers of manufactured goods', 'Manufacturing/B2B supplier archetype.');
    if (/\bexport|import\b/.test(corpus)) {
      push('trade_buyers', 'cross-border trade buyers', 'Export/import language present.');
    }
  }

  return segments.slice(0, 3);
}
