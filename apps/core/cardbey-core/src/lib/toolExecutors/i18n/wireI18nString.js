// src/lib/toolExecutors/i18n/wireI18nString.js
import fs from 'fs'

const COMPONENT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/g,
  /export\s+function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/g,
  /function\s+([A-Z]\w*)\s*\([^)]*\)\s*\{/g,
  /const\s+([A-Z]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
  /const\s+([A-Z]\w*)\s*=\s*function\s*\([^)]*\)\s*\{/g,
]

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function skipWhitespaceAndComments(source, index) {
  let i = index
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1
      continue
    }
    if (source.slice(i, i + 2) === '//') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (source.slice(i, i + 2) === '/*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    break
  }
  return i
}

function findMatchingBrace(source, openIndex) {
  let depth = 0
  let i = openIndex
  let inString = null
  let inTemplate = false
  let templateDepth = 0

  while (i < source.length) {
    const ch = source[i]
    const next2 = source.slice(i, i + 2)

    if (!inString && !inTemplate && next2 === '//') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (!inString && !inTemplate && next2 === '/*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }

    if (inString) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === inString) inString = null
      i += 1
      continue
    }

    if (inTemplate) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '`' && templateDepth === 0) {
        inTemplate = false
      } else if (ch === '$' && source[i + 1] === '{') {
        templateDepth += 1
      } else if (ch === '}' && templateDepth > 0) {
        templateDepth -= 1
      }
      i += 1
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = ch
      i += 1
      continue
    }
    if (ch === '`') {
      inTemplate = true
      i += 1
      continue
    }

    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}

function getBraceDepthAt(source, index) {
  let depth = 0
  for (let i = 0; i < index; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
  }
  return depth
}

function findComponents(source) {
  const components = []
  const seenBodyOpens = new Set()

  for (const pattern of COMPONENT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const bodyOpen = match.index + match[0].length - 1
      if (seenBodyOpens.has(bodyOpen)) continue
      const bodyClose = findMatchingBrace(source, bodyOpen)
      if (bodyClose < 0) continue

      seenBodyOpens.add(bodyOpen)
      components.push({
        name: match[1],
        bodyOpen,
        bodyClose,
        startLine: lineNumberAt(source, match.index),
        endLine: lineNumberAt(source, bodyClose),
      })
    }
  }

  components.sort((a, b) => a.bodyOpen - b.bodyOpen)

  // Drop components nested inside another component body
  return components.filter((comp, idx) => {
    for (let j = 0; j < idx; j += 1) {
      const outer = components[j]
      if (comp.bodyOpen > outer.bodyOpen && comp.bodyClose < outer.bodyClose) {
        return false
      }
    }
    return true
  })
}

function findComponentForLine(source, line) {
  const components = findComponents(source)
  if (components.length === 0) return null
  if (typeof line === 'number' && line > 0) {
    const match = components.find((c) => line >= c.startLine && line <= c.endLine)
    if (match) return match
  }
  return components[0]
}

function componentHasAnyTranslationHook(source) {
  return /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation/.test(source)
}

function isInsideTypeDefinition(lines, lineIdx) {
  const line = lines[lineIdx]
  // TypeScript method signature patterns
  if (/\)\s*=>\s*\w+\s*[;<,>|]/.test(line)) return true // () => void; () => Promise<T>
  if (/:\s*\([^)]*\)\s*=>/.test(line)) return true // prop: () =>
  if (/interface\s+\w+|type\s+\w+\s*[={]/.test(line)) return true
  // Check if we're inside an interface/type block
  const context = lines.slice(Math.max(0, lineIdx - 5), lineIdx).join('\n')
  if (/interface\s+\w+\s*\{|type\s+\w+\s*=\s*\{/.test(context)) return true
  return false
}

function fileHasConflictingTVariable(source) {
  return /const\s+t\s*=\s*(?!useTranslation\b)/.test(source)
}

function componentHasTranslationHook(source, component) {
  const body = source.slice(component.bodyOpen + 1, component.bodyClose)
  return /\bconst\s*{\s*t\s*}\s*=\s*useTranslation\b/.test(body)
}

function getHookIndent(source, bodyOpenIndex) {
  const lineStart = source.lastIndexOf('\n', bodyOpenIndex) + 1
  const linePrefix = source.slice(lineStart, bodyOpenIndex)
  const baseIndent = linePrefix.match(/^\s*/)?.[0] ?? ''
  return `${baseIndent}  `
}

function findSafeHookInsertIndex(source, component) {
  const { bodyOpen } = component
  let i = skipWhitespaceAndComments(source, bodyOpen + 1)

  if (i >= source.length) {
    return { ok: false, reason: 'empty_component_body' }
  }

  const depth = getBraceDepthAt(source, i)
  if (depth !== 1) {
    return { ok: false, reason: 'unsafe_hook_site', detail: 'insert_not_at_component_top_level' }
  }

  const lineStart = source.lastIndexOf('\n', i - 1) + 1
  const ahead = source.slice(i, i + 80)
  if (/^const\s*{\s*t\s*}\s*=\s*useTranslation\b/.test(ahead)) {
    return { ok: false, reason: 'hook_already_present' }
  }

  // Reject if we'd inject inside .map(, .forEach(, etc. callback bodies mis-detected as components
  const before = source.slice(Math.max(0, bodyOpen - 80), bodyOpen)
  if (/\.(map|forEach|filter|reduce|flatMap|some|every)\s*\(\s*$/.test(before)) {
    return { ok: false, reason: 'unsafe_hook_site', detail: 'inside_array_callback' }
  }

  return { ok: true, index: i }
}

function hasUseTranslationImport(source) {
  // Check for import line only — must be on a single line
  return /^import\s[^;]*\buseTranslation\b[^;]*from\s+['"]react-i18next['"]/m.test(source)
}

function findLastImportLine(lines) {
  let lastImportEndIdx = -1
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines and comments at top
    if (line.trim() === '' || /^\s*(\/\/|\/\*|\*)/.test(line)) {
      i += 1
      continue
    }

    // Single-line import: import X from 'y'  OR  import 'y'
    if (/^\s*import\s/.test(line) && line.includes(';')) {
      lastImportEndIdx = i
      i += 1
      continue
    }

    // Multiline import: import { or import type {
    // spans until we find the line with } from '...' ;
    if (/^\s*import\s/.test(line) && !line.includes(';')) {
      const startIdx = i
      i += 1
      while (i < lines.length) {
        if (lines[i].includes('from') && lines[i].includes(';')) {
          lastImportEndIdx = i
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    // First non-import, non-blank, non-comment line — stop
    if (lastImportEndIdx > -1) break
    i += 1
  }

  return lastImportEndIdx
}

function findUseDirectiveEndLine(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()
    if (trimmed === '') continue
    if (/^['"]use (client|server)['"]/.test(trimmed)) continue
    return i - 1
  }
  return -1
}

function ensureUseTranslationImport(source) {
  if (hasUseTranslationImport(source)) return source

  const importLine = `import { useTranslation } from 'react-i18next';`
  const lines = source.split('\n')
  const lastImportIdx = findLastImportLine(lines)

  if (lastImportIdx >= 0) {
    lines.splice(lastImportIdx + 1, 0, importLine)
    return lines.join('\n')
  }

  const insertAfter = findUseDirectiveEndLine(lines)
  lines.splice(insertAfter + 1, 0, importLine)
  return lines.join('\n')
}

function injectTranslationHook(source, component, hookLine) {
  if (componentHasAnyTranslationHook(source)) {
    return { ok: true, source, skipped: true }
  }

  if (fileHasConflictingTVariable(source)) {
    return { ok: false, needsManualReview: true, reason: 'conflicting_t_variable' }
  }

  if (componentHasTranslationHook(source, component)) {
    return { ok: true, source, skipped: true }
  }

  const insert = findSafeHookInsertIndex(source, component)
  if (!insert.ok) {
    return { ok: false, needsManualReview: true, reason: insert.reason, detail: insert.detail }
  }

  const indent = getHookIndent(source, component.bodyOpen)
  const insertion = `\n${indent}${hookLine}\n`
  const nextSource = source.slice(0, insert.index) + insertion + source.slice(insert.index)
  return { ok: true, source: nextSource, insertIndex: insert.index }
}

function replaceHardcodedString(source, { originalString, i18nKey, type, attr }) {
  switch (type) {
    case 'jsx_text':
      return source.replace(
        new RegExp(`>\\s*${escapeRegex(originalString)}\\s*<`, 'g'),
        `>{t('${i18nKey}')}<`,
      )

    case 'jsx_attr': {
      const attrName = attr || 'placeholder|aria-label|title|alt|label|tooltip'
      return source.replace(
        new RegExp(`(${attrName})="${escapeRegex(originalString)}"`, 'g'),
        `$1={t('${i18nKey}')}`,
      )
    }

    case 'object_prop':
      return source.replace(
        new RegExp(
          `(title|label|message|description|text|heading|placeholder):\\s*['"]${escapeRegex(originalString)}['"]`,
          'g',
        ),
        `$1: t('${i18nKey}')`,
      )

    case 'document_title':
      return source.replace(
        new RegExp(`document\\.title\\s*=\\s*['"]${escapeRegex(originalString)}['"]`, 'g'),
        `document.title = t('${i18nKey}')`,
      )

    default:
      return source
  }
}

export async function wireI18nString({
  filePath,
  originalString,
  i18nKey,
  namespace,
  type,
  line,
  attr,
}) {
  let source = fs.readFileSync(filePath, 'utf8')

  source = ensureUseTranslationImport(source)

  const component = findComponentForLine(source, line)
  if (!component) {
    console.warn('[I18N_WIRE_MANUAL]', { filePath, reason: 'no_component_found', line })
    return { ok: false, needsManualReview: true, reason: 'no_component_found', filePath }
  }

  if (typeof line === 'number' && line > 0) {
    const lines = source.split('\n')
    if (isInsideTypeDefinition(lines, line - 1)) {
      console.warn('[I18N_WIRE_MANUAL]', { filePath, reason: 'inside_type_definition', line })
      return {
        ok: false,
        needsManualReview: true,
        reason: 'inside_type_definition',
        filePath,
        line,
      }
    }
  }

  const nsArg = namespace && namespace !== 'translation' ? `'${namespace}'` : ''
  const hookLine = `const { t } = useTranslation(${nsArg})`

  const hookResult = injectTranslationHook(source, component, hookLine)
  if (!hookResult.ok) {
    console.warn('[I18N_WIRE_MANUAL]', {
      filePath,
      component: component.name,
      reason: hookResult.reason,
      detail: hookResult.detail,
      line,
    })
    return {
      ok: false,
      needsManualReview: true,
      reason: hookResult.reason,
      detail: hookResult.detail,
      filePath,
      component: component.name,
    }
  }

  source = hookResult.source

  const nextSource = replaceHardcodedString(source, { originalString, i18nKey, type, attr })
  if (nextSource === source) {
    console.warn('[I18N_WIRE_NO_MATCH]', { filePath, originalString, type, line })
    return { ok: false, reason: 'string_not_found', filePath, originalString }
  }

  fs.writeFileSync(filePath, nextSource, 'utf8')
  console.log('[I18N_WIRED]', {
    filePath,
    component: component.name,
    originalString,
    i18nKey,
    type,
    hookInjected: !hookResult.skipped,
  })
  return {
    ok: true,
    filePath,
    i18nKey,
    originalString,
    component: component.name,
    hookInjected: !hookResult.skipped,
  }
}
