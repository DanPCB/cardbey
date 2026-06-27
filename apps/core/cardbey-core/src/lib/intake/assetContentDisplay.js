/**
 * Format extracted asset content for user-facing display (Read → Display → Ask).
 */

/**
 * @param {import('./assetExtraction.js').ReturnType<typeof import('./assetExtraction.js').extractAssetContent> | null | undefined} extracted
 * @returns {string}
 */
export function formatAssetDisplay(extracted) {
  if (!extracted || typeof extracted !== 'object') {
    return 'No readable text was detected in this upload. You can still choose what to do with the file below.';
  }

  const lines = [];
  const title = String(extracted.title ?? '').trim();
  const subtitle = String(extracted.subtitle ?? '').trim();
  const description = String(extracted.description ?? '').trim();
  const items = Array.isArray(extracted.items) ? extracted.items : [];
  const detectedType = String(extracted.detectedType ?? 'document').trim();

  if (title && title !== 'Uploaded asset') {
    lines.push(title);
  } else if (!title) {
    lines.push('Uploaded asset');
  } else {
    lines.push('Uploaded asset');
  }

  if (subtitle) lines.push(subtitle);
  if (description) lines.push('', description);

  if (items.length > 0) {
    lines.push('', 'Detected items:');
    for (const item of items.slice(0, 8)) {
      const clean = String(item ?? '').trim();
      if (clean) lines.push(`• ${clean}`);
    }
  }

  const typeLabel = formatDetectedTypeLabel(detectedType);
  if (typeLabel) {
    lines.push('', `Detected as: ${typeLabel}`);
  }

  if (!subtitle && !description && items.length === 0 && title === 'Uploaded asset') {
    return 'No readable text was detected in this upload. You can still choose what to do with the file below.';
  }

  return lines.join('\n').trim();
}

/**
 * @param {string} detectedType
 */
function formatDetectedTypeLabel(detectedType) {
  const map = {
    event: 'Event or tour',
    promotion: 'Promotion or sale',
    store: 'Store-related content',
    business: 'Business information',
    graphic: 'Graphic or design',
    catalog: 'Product catalog',
    menu: 'Menu',
    document: 'Document',
  };
  return map[detectedType] ?? map.document;
}
