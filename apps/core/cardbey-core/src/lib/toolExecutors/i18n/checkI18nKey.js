// src/lib/toolExecutors/i18n/checkI18nKey.js
import fs from 'fs'

const DEFAULT_I18N_PATH = 'src/i18n.js'

export async function checkI18nKey({ key, locale = 'en', i18nPath }) {
  const filePath = i18nPath || process.env.I18N_PATH || DEFAULT_I18N_PATH
  const source = fs.readFileSync(filePath, 'utf8')

  // Parse key path: 'booking.summary' → ['booking', 'summary']
  const parts = key.split('.')

  // Simple text search first (fast path)
  const keyExists = source.includes(`${parts[parts.length - 1]}:`)

  console.log('[I18N_KEY_CHECK]', { key, locale, exists: keyExists, i18nPath: filePath })
  return { ok: true, key, exists: keyExists, locale, i18nPath: filePath }
}
