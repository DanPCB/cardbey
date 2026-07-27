// src/lib/toolExecutors/i18n/translateString.js
// Uses Claude API to translate strings into target locales
// This makes the agent language-agnostic — add any locale in future

export async function translateString({
  value, // English source string
  targetLocales = [], // ['vi', 'zh', 'fr', 'es', 'ja', 'ko', 'th', 'id']
  context, // e.g. 'button label on booking page'
}) {
  const locales = Array.isArray(targetLocales) ? targetLocales.filter(Boolean) : []
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    console.warn('[I18N_TRANSLATE_NO_KEY] No ANTHROPIC_API_KEY — using placeholder')
    const translations = { en: value }
    locales.forEach((l) => {
      translations[l] = `[${l}] ${value}`
    })
    return { ok: true, value, translations, placeholder: true }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Translate this UI string into the specified locales.
        
Source (English): "${value}"
Context: ${context || 'UI label'}
Target locales: ${locales.join(', ')}

Rules:
- Natural, concise UI language (not literal translation)
- Match the tone of the source (formal/casual)
- Keep brand names unchanged (Cardbey, C-Net)
- For Vietnamese: use natural Southern Vietnamese style
- Return ONLY valid JSON, no markdown

Format:
{
  "vi": "...",
  "zh": "...",
  "fr": "..."
}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error('[I18N_TRANSLATE_FAILED]', { value, status: response.status, errText })
    return { ok: false, value, error: `API ${response.status}`, raw: errText }
  }

  const data = await response.json()
  const text = data.content?.[0]?.text?.trim()

  try {
    const translations = JSON.parse(text)
    console.log('[I18N_TRANSLATED]', { value, translations })
    return { ok: true, value, translations: { en: value, ...translations } }
  } catch {
    console.error('[I18N_TRANSLATE_FAILED]', { value, text })
    return { ok: false, value, error: 'Parse failed', raw: text }
  }
}
