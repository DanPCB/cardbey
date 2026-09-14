/**
 * Deterministic query expansion for rich media acquisition.
 * No autonomous agent loop.
 */

/**
 * @param {string} query
 * @returns {{ primary: string, expanded: string[] }}
 */
export function expandMediaQuery(query) {
  const primary = String(query || '').trim();
  if (!primary) return { primary: '', expanded: [] };

  const lower = primary.toLowerCase();
  const expanded = new Set();

  // Generic: keep primary always first when searching
  const push = (q) => {
    const t = String(q || '').trim();
    if (t && t.toLowerCase() !== lower) expanded.add(t);
  };

  if (/vietnamese|banh|bakery|bánh/i.test(primary)) {
    push('Vietnamese bakery');
    push('banh mi photography');
    push('bakery interior');
    push('bread preparation');
    push('bakery packaging');
    push('pastry display');
  } else if (/cafe|coffee|café/i.test(primary)) {
    push('cafe interior');
    push('coffee cup');
    push('barista');
    push('cafe ambience');
  } else if (/fashion|boutique|apparel/i.test(primary)) {
    push('fashion boutique');
    push('clothing display');
    push('fashion model');
    push('retail storefront');
  } else if (/salon|beauty|hair/i.test(primary)) {
    push('beauty salon');
    push('hair salon');
    push('makeup artist');
  } else if (/restaurant|food|dining/i.test(primary)) {
    push('restaurant food plating');
    push('dining interior');
    push('chef kitchen');
  } else {
    // Generic advertising / content expansions
    const core = primary
      .replace(/\b(advertising|content|media|stock|photos?|videos?|images?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (core && core.length > 2) {
      push(`${core} photography`);
      push(`${core} interior`);
      push(`${core} product`);
    }
  }

  // Cap expansions for V1 latency
  return {
    primary,
    expanded: [...expanded].slice(0, 5),
  };
}
