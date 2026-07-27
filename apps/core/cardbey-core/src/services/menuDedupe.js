/**
 * Menu Item Deduplication Service
 * Normalizes item names for duplicate detection
 */

/**
 * Normalize menu item name for deduplication
 * Converts "Bacon & Egg McMuffin" -> "bacon and egg mcmuffin"
 * 
 * @param {string} name - Item name
 * @returns {string} Normalized name
 */
export function normalizeMenuItemName(name) {
  return (name || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

