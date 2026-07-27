// src/lib/toolExecutors/i18n/scanHardcodedStrings.js
import fs from 'fs'
import path from 'path'

const SKIP_FILES = [
  'i18n.js',
  '.test.',
  '.spec.',
  'node_modules',
  '.d.ts',
  '/api/',
  '/api.ts',
  '.api.ts',
  'Types.ts',
  '/utils/',
  '/lib/',
  '/test/',
  '.__baseline__.',
  'planGenerator.ts',
  'actionRegistry.ts',
  'missionActionQueue.ts',
  'stepHandlers.ts',
  'PerformerConsole.types.ts',
  'missionUiCache.ts',
  'dagExecutor.ts',
  'orchestraJobApi.ts',
  'storeMissionProgress.ts',
  'performerConsoleIntegration.ts',
  'performerPersonalProfileOrchestraFlow.ts',
  'blackboardStreamMerge.ts',
  'submitPerformerIntent.ts',
  'useIntakeV2.ts',
  'useMissionBlackboardRows.ts',
  'usePerformerConsole.ts',
  'useSmartDocumentArtifactPoll.ts',
  'ActiveMissionContext.tsx',
  'ActiveMissionContext.ts',
]

const SKIP_VALUES = [
  /^[a-z0-9_\-\.\/]+$/, // keys, paths
  /^\d+(\.\d+)?$/, // numbers
  /^#[0-9a-fA-F]{3,6}$/, // colors
  /^https?:\/\//, // URLs
  /^\[/, // log prefixes [SOMETHING]
  /^[A-Z0-9_]{3,}$/, // CONSTANTS
  /^cardbey$/i, // brand
]

function shouldSkip(value) {
  const v = value.trim()
  if (v.length < 2) return true
  if (/\b(jobId|tenantId|storeId|userId|draftId|missionId)\b/.test(v)) return true
  if (SKIP_VALUES.some((p) => p.test(v))) return true
  return false
}

function shouldSkipFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return SKIP_FILES.some((s) => normalized.includes(s))
}

export async function scanHardcodedStrings({ filePath }) {
  if (shouldSkipFile(filePath)) {
    return { ok: true, found: [], skipped: true }
  }

  const ext = path.extname(filePath)
  if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) {
    return { ok: true, found: [], skipped: true }
  }

  let source
  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    return { ok: false, error: err.message, filePath }
  }

  const tCallCount = (source.match(/\bt\(['"]/g) || []).length

  const found = []
  const lines = source.split('\n')

  lines.forEach((line, idx) => {
    const lineNum = idx + 1

    if (/\bt\(['"]/.test(line)) return
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return
    if (/^\s*(import|export)\s/.test(line)) return
    if (/^\s*(type|interface|enum)\s/.test(line)) return

    const jsxTextMatches = line.matchAll(/>([^<>{}\n]{3,})</g)
    for (const match of jsxTextMatches) {
      const value = match[1].trim()
      if (/[=&|!?:;{}()[\]]/.test(value)) continue
      if (/^\d/.test(value)) continue
      if (!shouldSkip(value) && /[A-Za-z]{2,}/.test(value)) {
        found.push({ type: 'jsx_text', value, line: lineNum })
      }
    }

    const attrMatches = line.matchAll(/(placeholder|aria-label|title|alt|label|tooltip)="([^"]{3,})"/g)
    for (const match of attrMatches) {
      const value = match[2].trim()
      if (!shouldSkip(value) && /[A-Za-z]{2,}/.test(value)) {
        found.push({ type: 'jsx_attr', attr: match[1], value, line: lineNum })
      }
    }

    const propMatches = line.matchAll(
      /(title|label|message|description|text|heading|placeholder):\s*['"]([^'"]{3,})['"]/g,
    )
    for (const match of propMatches) {
      const value = match[2].trim()
      if (!shouldSkip(value) && /[A-Za-z]{2,}/.test(value)) {
        found.push({ type: 'object_prop', key: match[1], value, line: lineNum })
      }
    }

    const titleMatch = line.match(/document\.title\s*=\s*['"]([^'"]+)['"]/)
    if (titleMatch) {
      const value = titleMatch[1].trim()
      if (!shouldSkip(value)) {
        found.push({ type: 'document_title', value, line: lineNum })
      }
    }
  })

  const unique = found.filter((item, idx, arr) => arr.findIndex((x) => x.value === item.value) === idx)

  console.log('[I18N_SCAN]', {
    filePath: path.basename(filePath),
    found: unique.length,
    alreadyWired: tCallCount > 0,
  })

  return { ok: true, filePath, found: unique, alreadyWired: tCallCount }
}
