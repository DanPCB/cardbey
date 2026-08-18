/**
 * Shared food / takeaway lexicon for intake category, vertical slug, and archetype hints.
 * Keep in sync with businessArchetypes FOOD_* / CAFE signals — do not invent new taxonomies.
 */

/** Regex corpus: cafe + restaurant + QSR / takeaway (incl. noodle). */
export const FOOD_VERTICAL_HINT_RE =
  /\b(cafe|café|coffee|restaurant|food|pizza|sushi|bakery|bar\b|noodle|noodles|takeaway|take-away|take\s*away|thai|ramen|pho|dumpling|gyoza|bento|kebab|burger|banh\s*mi|eatery|bistro|diner|canteen|fish\s*and\s*chips|fish\s*&\s*chips)\b/i;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function textSuggestsFoodVertical(text) {
  return FOOD_VERTICAL_HINT_RE.test(String(text || ''));
}

export default {
  FOOD_VERTICAL_HINT_RE,
  textSuggestsFoodVertical,
};
