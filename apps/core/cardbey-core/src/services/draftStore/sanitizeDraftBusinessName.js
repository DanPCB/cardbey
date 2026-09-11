/**
 * Mission / intake titles use "Create store: {name}". Never persist or display that prefix as the business name.
 * @param {unknown} value
 * @returns {string}
 */
export function stripMissionTitleBusinessPrefix(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return raw
    .replace(/^(create\s+mini\s+website|create\s+store|create\s+a\s+store)\s*:\s*/i, '')
    .replace(/^create\s+a\s+store\s+for\s+/i, '')
    .trim();
}

/**
 * Sanitize draft/preview identity fields so mission title prefixes never leak into public UI.
 * Mutates a shallow copy of preview (and nested meta) when needed.
 * @param {object|null|undefined} preview
 * @returns {object|null|undefined}
 */
export function sanitizeDraftPreviewBusinessName(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return preview;
  const next = { ...preview };
  let changed = false;
  const apply = (key) => {
    const cleaned = stripMissionTitleBusinessPrefix(next[key]);
    if (cleaned && cleaned !== next[key]) {
      next[key] = cleaned;
      changed = true;
    }
  };
  apply('storeName');
  apply('name');
  apply('slogan');
  apply('tagline');
  apply('heroText');
  if (next.meta && typeof next.meta === 'object' && !Array.isArray(next.meta)) {
    const meta = { ...next.meta };
    let metaChanged = false;
    for (const key of ['storeName', 'businessName', 'name']) {
      const cleaned = stripMissionTitleBusinessPrefix(meta[key]);
      if (cleaned && cleaned !== meta[key]) {
        meta[key] = cleaned;
        metaChanged = true;
      }
    }
    if (metaChanged) {
      next.meta = meta;
      changed = true;
    }
  }
  if (next.profile && typeof next.profile === 'object' && !Array.isArray(next.profile)) {
    const profile = { ...next.profile };
    const cleaned = stripMissionTitleBusinessPrefix(profile.name);
    if (cleaned && cleaned !== profile.name) {
      profile.name = cleaned;
      next.profile = profile;
      changed = true;
    }
  }
  return changed ? next : preview;
}
