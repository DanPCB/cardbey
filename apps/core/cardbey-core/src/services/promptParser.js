/**
 * @typedef {Object} ParsedPromotion
 * @property {string} productName
 * @property {number} discountPct
 * @property {number} durationSec
 * @property {string[]} screens
 */

const DISCOUNT_REGEX = /(\d{1,2})\s*%/;
const DURATION_REGEX = /(\d{2,4})\s*(?:s|sec|gi[âa]y|ph[úu]t|min|minutes?)/i;
const SCREEN_REGEX = /(Bakery#\d+|Screen#\d+|CNet#\w+)/i;

/**
 * Parse a Vietnamese/English promotion prompt into structured data.
 * Very naive heuristic that can be replaced with LLM later.
 * @param {string} prompt
 * @returns {ParsedPromotion}
 */
export function parsePromotionPrompt(prompt) {
  const lower = prompt.toLowerCase();
  let productName = 'Sản phẩm';

  const choIndex = lower.indexOf('cho ');
  if (choIndex >= 0) {
    const tail = prompt.slice(choIndex + 4);
    const tokens = tail.split(/[–—-]|giảm|discount|%|trong|in\s/i);
    const trimmed = tokens[0]?.trim();
    if (trimmed) {
      productName = trimmed.replace(/^[^\w]+|[^\w]+$/g, '') || productName;
    }
  }

  const discountMatch = prompt.match(DISCOUNT_REGEX);
  const discountPct = discountMatch
    ? Math.min(90, Math.max(1, parseInt(discountMatch[1], 10)))
    : 10;

  const durationMatch = prompt.match(DURATION_REGEX);
  let durationSec = 120;
  if (durationMatch) {
    const numeric = parseInt(durationMatch[1], 10);
    if (lower.includes('ph') || lower.includes('min')) {
      durationSec = numeric * 60;
    } else {
      durationSec = numeric;
    }
  }

  const screens = [];
  const screenMatch = prompt.match(SCREEN_REGEX);
  if (screenMatch) {
    screens.push(screenMatch[1]);
  }
  if (screens.length === 0) {
    screens.push('Bakery#1');
  }

  return {
    productName,
    discountPct,
    durationSec,
    screens,
  };
}

