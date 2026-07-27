/**
 * Shared mini-website section merge for PATCH API and mini_website_patch_sections executor.
 * Reads/writes Business.stylePreferences.miniWebsite { sections, theme, updatedAt }.
 */

/**
 * @param {unknown} stylePreferences
 * @returns {{ sections: object[], theme: unknown }}
 */
export function getMiniWebsiteSnapshot(stylePreferences) {
  const sp = stylePreferences && typeof stylePreferences === 'object' && !Array.isArray(stylePreferences) ? stylePreferences : {};
  const mini = sp.miniWebsite && typeof sp.miniWebsite === 'object' && !Array.isArray(sp.miniWebsite) ? sp.miniWebsite : {};
  const sections = Array.isArray(mini.sections) ? mini.sections : [];
  return {
    sections: sections.map((s) => (s && typeof s === 'object' ? { ...s } : s)),
    theme: mini.theme ?? null,
    miniBase: { ...mini },
  };
}

/**
 * Merge patch items { type, content } into sections by type; append missing types.
 * @param {object[]} sections
 * @param {Array<{ type?: string, content?: object }>} patchArr
 * @returns {object[]}
 */
export function mergeSectionPatches(sections, patchArr) {
  const out = Array.isArray(sections)
    ? sections.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const c = s.content && typeof s.content === 'object' && !Array.isArray(s.content) ? { ...s.content } : {};
        return { ...s, content: c };
      })
    : [];
  if (!Array.isArray(patchArr)) return out;
  for (const p of patchArr) {
    if (!p || typeof p !== 'object') continue;
    const type = String(p.type || '').trim();
    if (!type) continue;
    const content = p.content && typeof p.content === 'object' && !Array.isArray(p.content) ? p.content : {};
    const idx = out.findIndex((s) => s && typeof s === 'object' && String(s.type) === type);
    if (idx >= 0) {
      const cur = out[idx];
      const prevContent = cur.content && typeof cur.content === 'object' ? cur.content : {};
      out[idx] = { ...cur, content: { ...prevContent, ...content } };
    } else {
      out.push({ type, content: { ...content } });
    }
  }
  return out;
}

/**
 * @param {object} existingStylePreferences
 * @param {{ sections?: object[], patch?: Array<{ type?: string, content?: object }>, theme?: unknown }} body
 * @returns {{ nextStylePreferences: object, miniWebsite: object }}
 */
export function computeStylePreferencesUpdate(existingStylePreferences, body) {
  const existing =
    existingStylePreferences && typeof existingStylePreferences === 'object' && !Array.isArray(existingStylePreferences)
      ? existingStylePreferences
      : {};
  const { sections: prevSections, theme: prevTheme, miniBase } = getMiniWebsiteSnapshot(existing);

  let sections = prevSections;
  let theme = prevTheme;

  if (Array.isArray(body.sections)) {
    sections = body.sections.map((s) => (s && typeof s === 'object' ? { ...s } : s));
  } else if (Array.isArray(body.patch)) {
    sections = mergeSectionPatches(prevSections, body.patch);
  }

  if (body.theme !== undefined) {
    theme = body.theme;
  }

  const updatedMini = {
    ...miniBase,
    sections,
    theme,
    updatedAt: new Date().toISOString(),
  };

  return {
    nextStylePreferences: { ...existing, miniWebsite: updatedMini },
    miniWebsite: updatedMini,
  };
}
