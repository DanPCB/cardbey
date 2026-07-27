/**
 * Maintenance intake tools — audit_codebase, propose_patch, apply_patch.
 * Pure filesystem helpers (no shell exec).
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTEXT_RADIUS = 15;

function getMonorepoRoot() {
  if (process.env.CARDBEY_MONOREPO_ROOT) {
    return path.resolve(process.env.CARDBEY_MONOREPO_ROOT);
  }
  return path.resolve(process.cwd(), '../../..');
}

function getSearchRoots() {
  const root = getMonorepoRoot();
  const candidates = [
    path.join(root, 'apps/core/cardbey-core/src'),
    path.join(root, 'apps/cardbey-marketing-dashboard/src'),
    path.join(root, 'apps/dashboard/cardbey-marketing-dashboard/src'),
  ];
  return candidates.filter((p) => fs.existsSync(p));
}

function classifyErrorType(errorMessage) {
  const msg = String(errorMessage ?? '');
  if (/maximum update depth exceeded/i.test(msg)) return 'react_loop';
  if (/MISSING_STORE_CONTEXT/i.test(msg)) return 'missing_context';
  if (/unknown tool|dispatchTool|tool not registered|TOOL_NOT_REGISTERED/i.test(msg)) return 'tool_dispatch';
  if (/cannot read propert(?:y|ies) of undefined|null/i.test(msg)) return 'null_reference';
  if (/expected declaration|declaration dropped/i.test(msg)) return 'css_parse';
  return 'unknown';
}

function parseStackHints(stackTrace, errorMessage) {
  const combined = `${stackTrace ?? ''}\n${errorMessage ?? ''}`;
  const hints = [];
  const re =
    /(?:at\s+)?(?:\(?)(?:(?:[\w./\\-]+\/)*)([\w.-]+\.(?:jsx?|tsx?)):(\d+)(?::\d+)?\)?/gi;
  let match;
  while ((match = re.exec(combined)) !== null) {
    const file = match[1];
    const line = parseInt(match[2], 10);
    const full = match[0];
    const dirSeg =
      full
        .replace(/^at\s+/, '')
        .replace(/^\(/, '')
        .split(/[/\\]/)
        .slice(0, -1)
        .join('/') || '';
    hints.push({ file, line: Number.isFinite(line) ? line : 1, dirSeg });
  }
  return hints;
}

function basenameStem(name) {
  return path.basename(name).replace(/\.[^.]+$/, '').toLowerCase();
}

function scoreBasename(candidate, targetBasename) {
  const c = basenameStem(candidate);
  const t = basenameStem(targetBasename);
  let score = 0;
  if (c === t) score = 100;
  else if (c.startsWith(t) || t.startsWith(c)) score = 85;
  else if (c.includes(t) || t.includes(c)) score = 70;
  else if (c.includes('preview') && t.includes('website')) score = 55;
  else return 0;

  if (/\.jsx$/i.test(targetBasename)) {
    if (/\.tsx$/i.test(candidate)) score += 8;
    if (/\.ts$/i.test(candidate) && !/\.tsx$/i.test(candidate)) score -= 6;
  }
  if (/page$/i.test(c) && /preview$/i.test(t)) score += 4;
  return score;
}

function walkFiles(dir, matches, basenameTarget, maxFiles = 8000) {
  if (matches.length >= maxFiles) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (matches.length >= maxFiles) break;
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, matches, basenameTarget, maxFiles);
      continue;
    }
    if (!/\.(jsx?|tsx?)$/i.test(entry.name)) continue;
    const score = scoreBasename(entry.name, basenameTarget);
    if (score > 0) matches.push({ file: full, score });
  }
}

function findSourceFile(hints) {
  const roots = getSearchRoots();
  if (!roots.length || !hints.length) return null;

  const primary = hints[0];
  const targetBasename = primary.file;
  const matches = [];
  for (const root of roots) walkFiles(root, matches, targetBasename);

  if (!matches.length) return null;

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aSeg = primary.dirSeg && a.file.includes(primary.dirSeg.replace(/\\/g, '/')) ? 1 : 0;
    const bSeg = primary.dirSeg && b.file.includes(primary.dirSeg.replace(/\\/g, '/')) ? 1 : 0;
    return bSeg - aSeg;
  });

  return { absolutePath: matches[0].file, line: primary.line };
}

function readContextWindow(filePath, lineNumber) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const line = Math.max(1, Math.min(lineNumber || 1, lines.length));
  const start = Math.max(1, line - CONTEXT_RADIUS);
  const end = Math.min(lines.length, line + CONTEXT_RADIUS);
  const snippet = lines.slice(start - 1, end).join('\n');
  const rawLine = lines[line - 1] ?? '';
  return { lineRange: [start, end], codeSnippet: snippet, rawLine, lines };
}

/**
 * @param {{ errorMessage?: string, stackTrace?: string, context?: string }} params
 */
export async function auditCodebase({ errorMessage = '', stackTrace = '', context = '' } = {}) {
  const errorType = classifyErrorType(errorMessage);
  const hints = parseStackHints(stackTrace, `${errorMessage}\n${context}`);

  if (!hints.length) {
    return {
      file: null,
      errorType,
      codeSnippet: null,
      rawLine: null,
      lineRange: null,
    };
  }

  const located = findSourceFile(hints);
  if (!located?.absolutePath) {
    return {
      file: null,
      errorType,
      codeSnippet: null,
      rawLine: null,
      lineRange: null,
    };
  }

  try {
    const { lineRange, codeSnippet, rawLine } = readContextWindow(located.absolutePath, located.line);
    return {
      file: located.absolutePath,
      lineRange,
      errorType,
      codeSnippet,
      rawLine,
    };
  } catch {
    return {
      file: located.absolutePath,
      errorType,
      codeSnippet: null,
      rawLine: null,
      lineRange: null,
    };
  }
}

function buildUnifiedDiff(filePath, lineNumber, oldLine, newLine) {
  return [
    `--- a/${path.basename(filePath)}`,
    `+++ b/${path.basename(filePath)}`,
    `@@ -${lineNumber},1 +${lineNumber},1 @@`,
    `- ${oldLine}`,
    `+ ${newLine}`,
  ].join('\n');
}

/**
 * Parse a useEffect call starting at offset (brace-aware; ignores parens inside callback).
 * @param {string} source
 * @param {number} startOffset
 */
function parseUseEffectCallAt(source, startOffset) {
  const head = source.slice(startOffset);
  const open = head.match(/^useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>\s*\{/);
  if (!open) return null;

  const bracePos = startOffset + open[0].length - 1;
  let depth = 1;
  let inString = false;
  let stringChar = '';
  let i = bracePos + 1;

  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === stringChar && source[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null;

  const afterBrace = source.slice(i + 1, i + 120);
  const hasDeps = /^\s*,\s*\[/.test(afterBrace);
  let callEnd = i;
  if (hasDeps) {
    const bracketEnd = source.indexOf(']', i + 1);
    if (bracketEnd < 0) return null;
    const closeParen = source.indexOf(')', bracketEnd + 1);
    if (closeParen < 0) return null;
    callEnd = closeParen;
  } else {
    const closeParen = source.indexOf(')', i + 1);
    if (closeParen < 0) return null;
    callEnd = closeParen;
  }

  const callText = source.slice(startOffset, callEnd + 1);
  return { callText, callEnd, hasDeps };
}

function lineNumberAtOffset(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function findClosingLineForBareEffect(callText, startLine) {
  const callLines = callText.split('\n');
  for (let i = callLines.length - 1; i >= 0; i -= 1) {
    const line = callLines[i];
    if (/}\s*\)\s*;?\s*$/.test(line) && !/}\s*,\s*\[/.test(line)) {
      return {
        lineNumber: startLine + i,
        line,
        newLine: line.replace(/}\s*\)\s*;?\s*$/, '}, []);'),
      };
    }
    if (/\)\s*;?\s*$/.test(line) && !/,\s*\[/.test(callText)) {
      return {
        lineNumber: startLine + i,
        line,
        newLine: line.replace(/\)\s*;?\s*$/, ', []);'),
      };
    }
  }
  return null;
}

function scanBareUseEffectsInSource(source) {
  const bare = [];
  const opener = /useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>/g;
  let match;
  while ((match = opener.exec(source)) !== null) {
    const parsed = parseUseEffectCallAt(source, match.index);
    if (!parsed || parsed.hasDeps) continue;

    const startLine = lineNumberAtOffset(source, match.index);
    const closing = findClosingLineForBareEffect(parsed.callText, startLine);
    if (!closing || closing.newLine === closing.line) continue;

    bare.push({
      lineNumber: closing.lineNumber,
      line: closing.line,
      newLine: closing.newLine,
    });
  }
  return bare;
}

function extractUseEffectDepsArrays(source) {
  const lines = source.split(/\r?\n/);
  const results = [];
  const opener = /useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>/g;
  let match;
  while ((match = opener.exec(source)) !== null) {
    const parsed = parseUseEffectCallAt(source, match.index);
    if (!parsed || !parsed.hasDeps) continue;

    const depsMatch = parsed.callText.match(/}\s*,\s*\[([\s\S]*?)\]\s*\)\s*;?\s*$/);
    if (!depsMatch) continue;

    const openerLine = lineNumberAtOffset(source, match.index);
    const callLines = parsed.callText.split('\n');
    let depsCloseLine = openerLine;
    for (let i = 0; i < callLines.length; i += 1) {
      if (/\]\s*\)\s*;?\s*$/.test(callLines[i])) {
        depsCloseLine = openerLine + i;
        break;
      }
    }

    results.push({
      openerLine,
      depsCloseLine,
      depsLine: lines[depsCloseLine - 1] ?? callLines[callLines.length - 1] ?? '',
      depsContent: depsMatch[1],
    });
  }
  return results;
}

function isUnstableDepsContent(depsContent) {
  const trimmed = depsContent.trim();
  if (!trimmed) return false;
  if (/\{\s*\}/.test(trimmed) || /\[\s*\{/.test(trimmed) || /\[\s*[^\]]*\.filter\s*\(/.test(trimmed)) {
    return true;
  }
  if (/\.filter\s*\(|\.map\s*\(|\.sort\s*\(/.test(trimmed)) return true;
  if (/\{[^}]+\}/.test(trimmed)) return true;

  const items = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of items) {
    if (/^(true|false|null|undefined|\d+|'[^']*'|"[^"]*")$/.test(item)) continue;
    if (/^is[A-Z]\w*/.test(item)) continue;
    if (/\?\.(id|Id)\s*$/.test(item) || /Id\s*$/.test(item)) continue;
    if (/\.(filter|map|sort|reduce)\s*\(/.test(item)) return true;
    if (/^[A-Z][\w]*/.test(item)) return true;
    if (/^load[A-Z]\w*/.test(item)) return true;
    if (/^[a-z][\w]*[A-Z][\w]*/.test(item)) return true;
  }
  return false;
}

function scanUnstableUseEffectDeps(source) {
  const unstable = [];
  for (const entry of extractUseEffectDepsArrays(source)) {
    if (!isUnstableDepsContent(entry.depsContent)) continue;
    unstable.push({
      openerLine: entry.openerLine,
      depsCloseLine: entry.depsCloseLine,
      depsLine: entry.depsLine,
      depsContent: entry.depsContent.trim(),
    });
  }
  return unstable;
}

function analyzeUnstableDepItems(depsContent) {
  const items = depsContent
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unstable = [];

  for (const item of items) {
    if (/^(true|false|null|undefined|\d+|'[^']*'|"[^"]*")$/.test(item)) continue;
    if (/^is[A-Z]\w*/.test(item)) continue;
    if (/Id\s*$/.test(item) || /\?\.(id|Id)\s*$/.test(item)) continue;

    if (/\{/.test(item) || /\[\s*\{/.test(item) || /\.(filter|map|sort|reduce)\s*\(/.test(item)) {
      unstable.push({ kind: 'inline', name: item });
    } else if (/^load[A-Z]\w*/.test(item) || /^use[A-Z]\w*/.test(item)) {
      unstable.push({ kind: 'function', name: item });
    } else if (/^[a-z][\w]*[A-Z][\w]*/.test(item)) {
      unstable.push({ kind: 'object', name: item });
    }
  }

  return unstable;
}

function primitiveVarNameForObject(objectName) {
  if (objectName === 'publishedPublicStore') return 'storeId';
  const base = objectName.replace(/[^a-zA-Z0-9]/g, '');
  return `${base.charAt(0).toLowerCase()}${base.slice(1)}Id`;
}

function buildStableDepsSuggestion(entry) {
  const unstableItems = analyzeUnstableDepItems(entry.depsContent);
  const allItems = entry.depsContent.split(',').map((s) => s.trim()).filter(Boolean);
  const unstableNames = new Set(unstableItems.map((u) => u.name));

  const objectRefs = unstableItems.filter((u) => u.kind === 'object');
  const funcRefs = unstableItems.filter((u) => u.kind === 'function');
  const inlineRefs = unstableItems.filter((u) => u.kind === 'inline');

  const suggestedVars = [];
  const newDeps = [];

  for (const item of allItems) {
    const objectRef = objectRefs.find((o) => o.name === item);
    if (objectRef) {
      const varName = primitiveVarNameForObject(objectRef.name);
      const expr = `${objectRef.name}?.id`;
      if (!suggestedVars.some((v) => v.varName === varName)) {
        suggestedVars.push({ varName, expr });
      }
      if (!newDeps.includes(varName)) newDeps.push(varName);
      continue;
    }

    if (objectRefs.some((o) => item === `${o.name}?.id` || item.startsWith(`${o.name}?`))) {
      continue;
    }

    if (funcRefs.some((f) => f.name === item) || inlineRefs.some((i) => i.name === item)) {
      continue;
    }

    if (!unstableNames.has(item) && !newDeps.includes(item)) {
      newDeps.push(item);
    }
  }

  return { suggestedVars, newDeps, objectRefs, funcRefs, inlineRefs };
}

function buildSuggestedUnstableDepsPatch(unstable) {
  const blocks = [];

  for (const entry of unstable) {
    const analysis = buildStableDepsSuggestion(entry);
    const { objectRefs, funcRefs, inlineRefs, suggestedVars, newDeps } = analysis;

    if (objectRefs.length > 0) {
      const label = objectRefs.map((o) => o.name).join(', ');
      blocks.push(`// Line ${entry.openerLine} — unstable object reference: ${label}`);
      blocks.push('- useEffect(() => {');
      blocks.push('-   ...');
      blocks.push(`- }, [${entry.depsContent}]);`);
      blocks.push('+ // SUGGESTED: extract stable primitive deps only');
      for (const v of suggestedVars) {
        blocks.push(`+ const ${v.varName} = ${v.expr};`);
      }
      blocks.push('+ useEffect(() => {');
      blocks.push('+   ...');
      blocks.push(`+ }, [${newDeps.join(', ')}]);`);
    } else if (funcRefs.length > 0) {
      const label = funcRefs.map((f) => f.name).join(', ');
      blocks.push(`// Line ${entry.openerLine} — unstable function reference: ${label}`);
      blocks.push(`- ${entry.depsLine.trimEnd()}`);
      blocks.push(`+ // SUGGESTED: wrap ${label} in useCallback, or move`);
      blocks.push('+ // inside the effect body if it does not need to be a dependency');
      blocks.push(`+ }, [${newDeps.join(', ')}]);`);
    } else if (inlineRefs.length > 0) {
      const label = inlineRefs.map((i) => i.name).join(', ');
      blocks.push(`// Line ${entry.openerLine} — unstable inline expression: ${label}`);
      blocks.push(`- ${entry.depsLine.trimEnd()}`);
      blocks.push('+ // SUGGESTED: extract to a useMemo above the useEffect');
      blocks.push(`+ const stableDeps = useMemo(() => (${label}), [/* stable inputs */]);`);
      blocks.push('+ }, [stableDeps]);');
    }

    blocks.push('');
  }

  return blocks.join('\n').trim();
}

function proposeReactLoopPatch(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    return {
      file,
      patch: '',
      explanation:
        'Detected react_loop error but could not read the source file. Manual investigation required.',
      riskLevel: 'high',
    };
  }

  const bare = scanBareUseEffectsInSource(source);
  if (bare.length > 0) {
    const patch = bare
      .map((b) => buildUnifiedDiff(file, b.lineNumber, b.line, b.newLine))
      .join('\n');
    const explanation = bare
      .map((b) => `Bare useEffect at line ${b.lineNumber}: add empty dependency array [].`)
      .join(' ');
    return { file, patch, explanation, riskLevel: 'medium' };
  }

  const unstable = scanUnstableUseEffectDeps(source);
  if (unstable.length > 0) {
    const lineList = unstable.map((u) => u.openerLine).join(', ');
    return {
      file,
      patch: buildSuggestedUnstableDepsPatch(unstable),
      explanation:
        `Suggested fixes require human review before applying. Unstable deps detected at lines ${lineList}. See diff for recommended stabilisation pattern.`,
      riskLevel: 'medium',
    };
  }

  return {
    file,
    patch: '',
    explanation:
      'Detected react_loop error but could not find a bare useEffect() or unstable deps to patch automatically. Manual review required.',
    riskLevel: 'high',
  };
}

function proposeMissingContextPatch(file, lineRange, codeSnippet) {
  const lines = String(codeSnippet ?? '').split(/\r?\n/);
  const [startLine] = lineRange ?? [1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/storeId|MISSING_STORE_CONTEXT|validateExecution/i.test(line)) continue;
    const absLine = Math.max(1, startLine + i - 1);
    const guard =
      "  if (STORE_CREATION_TOOLS.has(toolName)) { /* allow store creation without active store */ return; }";
    const newLine = `${guard}\n${line}`;
    return {
      file,
      patch: buildUnifiedDiff(file, absLine, line, newLine),
      explanation:
        'Added STORE_CREATION_TOOLS guard before storeId validation to allow store-creation tools without active store context.',
      riskLevel: 'medium',
    };
  }

  return {
    file,
    patch: '',
    explanation: 'Missing store context detected; add STORE_CREATION_TOOLS guard near storeId validation manually.',
    riskLevel: 'medium',
  };
}

function proposeToolDispatchPatch(file, lineRange, codeSnippet) {
  const toolMatch = String(codeSnippet ?? '').match(/['"]([a-z0-9_.-]+)['"]/i);
  const toolName = toolMatch?.[1] ?? 'audit_codebase';
  return {
    file,
    patch: [
      `--- a/toolRegistry registration hint`,
      `+++ b/toolRegistry registration hint`,
      `@@ registration @@`,
      `- // missing: ${toolName}`,
      `+ // Register "${toolName}" in toolRegistry.js and toolExecutors/index.js`,
    ].join('\n'),
    explanation: `Register "${toolName}" in toolRegistry.js and map an executor in toolExecutors/index.js.`,
    riskLevel: 'low',
  };
}

function proposeNullReferencePatch(file, lineRange, codeSnippet, rawLine) {
  const line = String(rawLine ?? '').trim();
  if (!line) {
    return {
      file,
      patch: '',
      explanation: 'Null reference detected; add optional chaining or a null guard on the failing property access.',
      riskLevel: 'low',
    };
  }

  const patched = line.replace(/(\w+)\.(\w+)/, '$1?.$2');
  const lineNum = lineRange?.[0] ?? 1;
  return {
    file,
    patch: buildUnifiedDiff(file, lineNum, line, patched),
    explanation: 'Added optional chaining on the property access that may be undefined.',
    riskLevel: 'low',
  };
}

/**
 * @param {{ file?: string|null, lineRange?: number[]|null, errorType?: string, codeSnippet?: string|null, rawLine?: string|null }} params
 */
export async function proposePatch({
  file,
  lineRange = null,
  errorType = 'unknown',
  codeSnippet = null,
  rawLine = null,
} = {}) {
  if (!file) {
    return {
      file: null,
      patch: '',
      explanation: 'No source file available for patch proposal.',
      riskLevel: 'high',
    };
  }

  switch (errorType) {
    case 'react_loop':
      return proposeReactLoopPatch(file);
    case 'missing_context':
      return proposeMissingContextPatch(file, lineRange, codeSnippet);
    case 'tool_dispatch':
      return proposeToolDispatchPatch(file, lineRange, codeSnippet);
    case 'null_reference':
      return proposeNullReferencePatch(file, lineRange, codeSnippet, rawLine);
    case 'css_parse':
      return {
        file,
        patch: '',
        explanation: 'CSS warning only — browser compatibility issue, no code change required.',
        riskLevel: 'low',
      };
    default:
      return {
        file,
        patch: '',
        explanation: 'Could not determine fix pattern for this error type. Manual investigation required.',
        riskLevel: 'high',
      };
  }
}

function getCardbeyCorePackageRoot() {
  return path.resolve(getMonorepoRoot(), 'apps/core/cardbey-core');
}

function getAllowedPatchRoots() {
  const root = getMonorepoRoot();
  const marketingSrc = [
    path.join(root, 'apps/cardbey-marketing-dashboard/src'),
    path.join(root, 'apps/dashboard/cardbey-marketing-dashboard/src'),
  ].find((p) => fs.existsSync(p));
  const candidates = [path.join(root, 'apps/core/cardbey-core/src'), marketingSrc].filter(Boolean);
  return candidates.map((p) => path.resolve(p));
}

function isUnderAllowedPatchRoot(resolvedFile) {
  const normalized = path.resolve(resolvedFile);
  return getAllowedPatchRoots().some(
    (root) => normalized === root || normalized.startsWith(`${root}${path.sep}`),
  );
}

function parseSuggestedPatchHunks(patch) {
  const lines = String(patch ?? '').split(/\r?\n/);
  const hunks = [];
  let current = null;

  for (const line of lines) {
    if (/^\/\/\s*Line\s+\d+/i.test(line)) {
      if (current) hunks.push(current);
      current = { header: line, minus: [], plus: [] };
      continue;
    }
    if (!current) continue;

    if (line.startsWith('-')) {
      const content = line.startsWith('- ') ? line.slice(2) : line.slice(1);
      current.minus.push(content);
    } else if (line.startsWith('+')) {
      let content = line.startsWith('+ ') ? line.slice(2) : line.slice(1);
      if (content.startsWith('// SUGGESTED: ')) {
        content = content.slice('// SUGGESTED: '.length);
      } else if (content.startsWith('// SUGGESTED:')) {
        content = content.slice('// SUGGESTED:'.length).trimStart();
      }
      current.plus.push(content);
    }
  }

  if (current) hunks.push(current);
  return hunks;
}

function findMinusBlockInLines(fileLines, minusLines) {
  if (!minusLines.length) return null;
  const needle = minusLines.map((l) => l.trimEnd());

  for (let i = 0; i <= fileLines.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (fileLines[i + j].trimEnd() !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { startLine: i, endLine: i + needle.length };
    }
  }
  return null;
}

function applyHunksToFileContent(content, patch) {
  const hunks = parseSuggestedPatchHunks(patch);
  let fileLines = content.split(/\r?\n/);
  let applied = 0;

  for (const hunk of hunks) {
    if (!hunk.minus.length) continue;

    const location = findMinusBlockInLines(fileLines, hunk.minus);
    if (!location) {
      console.warn(`[applyPatch] hunk not found, skipped: ${hunk.header}`);
      continue;
    }

    fileLines = [
      ...fileLines.slice(0, location.startLine),
      ...hunk.plus,
      ...fileLines.slice(location.endLine),
    ];
    applied += 1;
  }

  return { content: fileLines.join('\n'), hunksApplied: applied };
}

function appendPatchAuditEntry(entry) {
  const auditPath = path.join(getCardbeyCorePackageRoot(), 'patches.audit.json');
  let records = [];
  try {
    if (fs.existsSync(auditPath)) {
      const parsed = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      records = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    records = [];
  }
  records.push(entry);
  try {
    fs.writeFileSync(auditPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[applyPatch] audit log write failed:', err?.message ?? err);
  }
  return entry;
}

/**
 * Atomically apply a suggested patch to a source file under allowed repo roots.
 * @param {{ file?: string|null, patch?: string|null, context?: object }} params
 */
export async function applyPatch({ file, patch, context = {} } = {}) {
  const filePath = typeof file === 'string' ? file.trim() : '';
  const patchText = typeof patch === 'string' ? patch : '';

  if (!filePath) return { error: 'NO_FILE_SPECIFIED' };
  if (!patchText.trim()) return { error: 'EMPTY_PATCH' };
  if (!path.isAbsolute(filePath)) return { error: 'RELATIVE_PATH_REJECTED' };
  if (!fs.existsSync(filePath)) return { error: 'FILE_NOT_FOUND' };

  const resolvedFile = path.resolve(filePath);
  if (!isUnderAllowedPatchRoot(resolvedFile)) {
    return { error: 'PATH_TRAVERSAL_REJECTED' };
  }

  const backupFile = `${resolvedFile}.patch.bak`;
  const tmpFile = `${resolvedFile}.patch.tmp`;

  let originalContent;
  try {
    originalContent = fs.readFileSync(resolvedFile, 'utf8');
  } catch {
    return { error: 'FILE_NOT_FOUND' };
  }

  try {
    fs.copyFileSync(resolvedFile, backupFile);
  } catch {
    return { error: 'BACKUP_FAILED' };
  }

  const { content: patchedContent, hunksApplied } = applyHunksToFileContent(originalContent, patchText);
  if (hunksApplied === 0) {
    return { error: 'NO_HUNKS_APPLIED' };
  }

  try {
    fs.writeFileSync(tmpFile, patchedContent, 'utf8');
  } catch {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    return { error: 'WRITE_FAILED' };
  }

  try {
    fs.renameSync(tmpFile, resolvedFile);
  } catch {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    return { error: 'RENAME_FAILED' };
  }

  const auditEntry = {
    timestamp: new Date().toISOString(),
    file: resolvedFile,
    errorType: context?.errorType ?? 'unknown',
    hunksApplied,
    patch: patchText,
    appliedBy: 'operator',
    missionId: context?.missionId ?? null,
  };

  appendPatchAuditEntry(auditEntry);

  return {
    status: 'applied',
    file: resolvedFile,
    hunksApplied,
    backupFile,
    auditEntry,
  };
}
