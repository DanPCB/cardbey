/**
 * Merge per-asset menu extractions into one catalog-facing item list + metadata.
 */

/**
 * @param {string} name
 */
function normalizeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * @param {object} item
 * @param {{ assetId: string, page?: number, sourceOrder: number }} ref
 */
function withSourceRef(item, ref) {
  const sourceRefs = Array.isArray(item.sourceRefs) ? [...item.sourceRefs] : [];
  sourceRefs.push({
    assetId: ref.assetId,
    page: ref.page ?? 1,
    region: typeof item.sourceRegion === 'string' ? item.sourceRegion : undefined,
  });
  return { ...item, sourceRefs };
}

/**
 * @param {Array<{
 *   assetId: string,
 *   sourceOrder: number,
 *   items?: unknown[],
 *   contact?: object,
 *   openingHours?: unknown[],
 *   notes?: string[],
 *   warnings?: string[],
 * }>} perAsset
 */
export function mergeMenuImportExtractions(perAsset) {
  const sorted = [...(perAsset || [])].sort(
    (a, b) => (Number(a.sourceOrder) || 0) - (Number(b.sourceOrder) || 0),
  );

  /** @type {Map<string, object>} */
  const byKey = new Map();
  const contact = {};
  const openingHours = [];
  const notes = [];
  const warnings = [];
  const categoriesSeen = new Set();

  for (const page of sorted) {
    const assetId = String(page.assetId || '');
    const sourceOrder = Number(page.sourceOrder) || 0;
    if (Array.isArray(page.warnings)) {
      for (const w of page.warnings) {
        if (typeof w === 'string' && w.trim()) warnings.push(w.trim());
      }
    }
    if (Array.isArray(page.notes)) {
      for (const n of page.notes) {
        if (typeof n === 'string' && n.trim()) notes.push(n.trim());
      }
    }
    if (page.contact && typeof page.contact === 'object') {
      for (const key of ['phone', 'email', 'address', 'website', 'businessName']) {
        const v = page.contact[key];
        if (typeof v === 'string' && v.trim() && !contact[key]) contact[key] = v.trim();
      }
      if (Array.isArray(page.contact.socialHandles)) {
        const existing = Array.isArray(contact.socialHandles) ? contact.socialHandles : [];
        contact.socialHandles = [
          ...new Set([
            ...existing,
            ...page.contact.socialHandles.filter((s) => typeof s === 'string' && s.trim()),
          ]),
        ];
      }
    }
    if (Array.isArray(page.openingHours)) {
      for (const row of page.openingHours) {
        if (row && typeof row === 'object') openingHours.push(row);
      }
    }

    const items = Array.isArray(page.items) ? page.items : [];
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) continue;
      const category = typeof raw.category === 'string' ? raw.category.trim() : '';
      const categoryPath = Array.isArray(raw.categoryPath)
        ? raw.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
        : [];
      const pathKey = categoryPath.length
        ? categoryPath.map((p) => normalizeKey(p)).join('>')
        : normalizeKey(category);
      if (categoryPath.length) {
        for (const part of categoryPath) categoriesSeen.add(part);
      } else if (category) {
        categoriesSeen.add(category);
      }
      // Deduplicate by path + name (same name in different categories stays distinct).
      const key = `${pathKey}::${normalizeKey(name)}`;
      const stamped = withSourceRef(
        {
          ...raw,
          ...(categoryPath.length ? { categoryPath } : {}),
          ...(category || categoryPath.length
            ? { category: category || categoryPath[categoryPath.length - 1] }
            : {}),
        },
        { assetId, sourceOrder, page: 1 },
      );
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, stamped);
        continue;
      }
      // Prefer higher confidence; fill missing price/duration/description.
      const next = { ...existing };
      const confA = Number(existing.confidence) || 0;
      const confB = Number(stamped.confidence) || 0;
      if (confB > confA) {
        Object.assign(next, stamped, {
          sourceRefs: [...(existing.sourceRefs || []), ...(stamped.sourceRefs || [])],
          categoryPath:
            (Array.isArray(stamped.categoryPath) && stamped.categoryPath.length
              ? stamped.categoryPath
              : existing.categoryPath) || categoryPath,
        });
      } else {
        if (next.price == null && stamped.price != null) next.price = stamped.price;
        if (!next.description && stamped.description) next.description = stamped.description;
        if (next.durationMinutes == null && stamped.durationMinutes != null) {
          next.durationMinutes = stamped.durationMinutes;
        }
        if ((!next.inclusions || !next.inclusions.length) && Array.isArray(stamped.inclusions)) {
          next.inclusions = stamped.inclusions;
        }
        if ((!next.categoryPath || !next.categoryPath.length) && categoryPath.length) {
          next.categoryPath = categoryPath;
        }
        next.sourceRefs = [...(existing.sourceRefs || []), ...(stamped.sourceRefs || [])];
        warnings.push(`Possible duplicate kept merged: ${name}`);
      }
      byKey.set(key, next);
    }
  }

  const items = Array.from(byKey.values());
  return {
    items,
    categories: Array.from(categoriesSeen),
    contact: Object.keys(contact).length ? contact : undefined,
    openingHours: openingHours.length ? openingHours : undefined,
    notes: notes.length ? notes : undefined,
    warnings,
  };
}

/**
 * Flatten richer extract rows into catalog MenuItemExtract shape.
 * @param {object[]} items
 */
export function toCatalogMenuItems(items) {
  return (items || [])
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const name = String(it.name || it.normalizedName || it.sourceName || '').trim();
      if (!name) return null;
      const inclusions = Array.isArray(it.inclusions)
        ? it.inclusions.filter((s) => typeof s === 'string' && s.trim())
        : [];
      const duration =
        typeof it.durationMinutes === 'number' && Number.isFinite(it.durationMinutes)
          ? it.durationMinutes
          : null;
      let description = typeof it.description === 'string' ? it.description.trim() : '';
      if (inclusions.length) {
        const inc = inclusions.join('; ');
        description = description ? `${description}\nIncludes: ${inc}` : `Includes: ${inc}`;
      }
      if (duration != null && duration > 0 && !/\d+\s*min/i.test(description)) {
        description = description ? `${duration} mins. ${description}` : `${duration} mins`;
      }
      const addOns = Array.isArray(it.addOns) ? it.addOns : [];
      if (addOns.length) {
        const addonText = addOns
          .map((a) => {
            const n = typeof a?.name === 'string' ? a.name : '';
            const p = a?.price != null ? ` $${a.price}` : a?.priceText ? ` ${a.priceText}` : '';
            return n ? `${n}${p}` : '';
          })
          .filter(Boolean)
          .join('; ');
        if (addonText) {
          description = description ? `${description}\nAdd-ons: ${addonText}` : `Add-ons: ${addonText}`;
        }
      }
      return {
        name,
        price: it.price != null && Number.isFinite(Number(it.price)) ? Number(it.price) : null,
        currency: typeof it.currency === 'string' && it.currency ? it.currency : 'AUD',
        description,
        category: typeof it.category === 'string' && it.category.trim() ? it.category.trim() : '',
        ...(Array.isArray(it.categoryPath) && it.categoryPath.length
          ? { categoryPath: it.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean) }
          : {}),
        imageUrl: null,
        confidence: Number.isFinite(Number(it.confidence)) ? Number(it.confidence) : 0.7,
        durationMinutes: duration,
        inclusions,
        sourceRefs: Array.isArray(it.sourceRefs) ? it.sourceRefs : [],
        options: Array.isArray(it.options) ? it.options : undefined,
        addOns: addOns.length ? addOns : undefined,
      };
    })
    .filter(Boolean);
}
