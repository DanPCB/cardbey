// src/lib/toolExecutors/i18n/generateI18nKey.js

// Derives a camelCase key from a string
// "Book now" → "bookNow"
// "No unpaired devices" → "noUnpairedDevices"
export async function generateI18nKey({ 
  value,      // original English string
  namespace,  // suggested namespace
  filePath,   // hint for namespace inference
}) {
  // Infer namespace from file path if not provided
  if (!namespace) {
    if (filePath.includes('booking')) namespace = 'booking'
    else if (filePath.includes('device')) namespace = 'devices'
    else if (filePath.includes('performer') || filePath.includes('console')) namespace = 'performer'
    else if (filePath.includes('assistant')) namespace = 'assistant'
    else if (filePath.includes('nav') || filePath.includes('header')) namespace = 'nav'
    else if (filePath.includes('store') || filePath.includes('public')) namespace = 'store'
    else namespace = 'common'
  }

  // Generate camelCase key from value
  const key = value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // remove special chars
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 5)                   // max 5 words
    .map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1))
    .join('')

  const fullKey = `${namespace}.${key}`
  console.log('[I18N_KEY_GENERATED]', { value, fullKey })
  return { ok: true, key, namespace, fullKey }
}