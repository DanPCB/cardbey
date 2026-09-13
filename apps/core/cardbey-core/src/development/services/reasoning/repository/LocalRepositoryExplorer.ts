import fs from 'node:fs';
import path from 'node:path';
import { cardbeyRepositoryManifest } from '../../../repositories/cardbeyRepositoryManifest.js';
import type {
  RepositoryExplorer,
  RepositoryExplorerInput,
  RepositoryExplorerResult,
  RepositoryCandidate,
  RepositoryRelationship,
} from './RepositoryExplorer.js';
import {
  extractDistinctiveTerms,
  extractGenericTerms,
  extractConstraintPhrases,
} from '../termExtraction.js';

const MAX_FILE_BYTES = 256 * 1024;
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

const SCORES: Record<RepositoryRelationship, number> = {
  SUSPECTED_FILE: 100,
  ROUTE_OWNER: 90,
  ROUTE_DEFINITION_UNRESOLVED: 55,
  IMPORTED_BY_ROUTE_OWNER: 60,
  IMPORTS_RELEVANT_FILE: 30,
  FILENAME_MATCH: 50,
  TEST_FOR_CANDIDATE: 35,
  DIRECTORY_PROXIMITY: 20,
  KEYWORD_MATCH: 8,
};

// Per-signal contribution caps. The structural hierarchy is preserved, but
// occurrence-heavy signals (keyword/filename matches) cannot inflate without
// bound and cannot outrank route ownership or direct import evidence.
const SIGNAL_CAPS: Record<RepositoryRelationship, number> = {
  SUSPECTED_FILE: 100,
  ROUTE_OWNER: 90,
  ROUTE_DEFINITION_UNRESOLVED: 55,
  IMPORTED_BY_ROUTE_OWNER: 60,
  IMPORTS_RELEVANT_FILE: 30,
  FILENAME_MATCH: 60,
  TEST_FOR_CANDIDATE: 35,
  DIRECTORY_PROXIMITY: 20,
  KEYWORD_MATCH: 40,
};

// Generic terms are weak evidence; they receive a fraction of the keyword
// weight and are further bounded by the KEYWORD_MATCH cap.
const GENERIC_KEYWORD_WEIGHT = 2;

interface ResolvedImport {
  source: string;
  names: string[];
  resolvedPath: string | null;
}

interface MutableCandidate {
  path: string;
  score: number;
  reasons: string[];
  terms: Set<string>;
  relationship: RepositoryRelationship;
  maxSignalScore: number;
  signalScores: Map<RepositoryRelationship, number>;
}

interface RepositoryIndex {
  fileIndex: Map<string, string>;
  importsByFile: Map<string, ResolvedImport[]>;
  routeOwners: Record<string, string | null>;
}

const indexCache = new Map<string, RepositoryIndex>();

export class LocalRepositoryExplorer implements RepositoryExplorer {
  async explore(input: RepositoryExplorerInput): Promise<RepositoryExplorerResult> {
    const { mission, evidence, repoRoot } = input;

    const searchRoots = selectSearchRoots();
    const cacheKey = `${repoRoot}:${searchRoots.join('|')}`;
    let cached = indexCache.get(cacheKey);
    if (!cached) {
      const fileIndex = await this.buildFileIndex(repoRoot, searchRoots);
      const importsByFile = this.buildResolvedImportsIndex(repoRoot, fileIndex);
      const routeOwners = this.buildRouteOwners(repoRoot, fileIndex, importsByFile);
      cached = { fileIndex, importsByFile, routeOwners };
      indexCache.set(cacheKey, cached);
    }
    const { fileIndex, importsByFile, routeOwners } = cached;

    const candidateMap = new Map<string, MutableCandidate>();

    for (const suspected of evidence.suspectedFiles ?? []) {
      this.addSignal(candidateMap, suspected, 'SUSPECTED_FILE', 'Explicitly suspected in evidence', []);
    }

    const distinctive = extractDistinctiveTerms(mission, evidence);
    const generic = extractGenericTerms(mission, evidence);

    for (const route of evidence.affectedRoutes ?? []) {
      const ownerPath = routeOwners[route] ?? null;
      if (ownerPath) {
        this.addSignal(
          candidateMap,
          ownerPath,
          'ROUTE_OWNER',
          `Route ${route} renders component in this file`,
          [route],
        );
        this.followImports(ownerPath, importsByFile, candidateMap, 1, 2);
      } else {
        const definitionFile = this.findRouteDefinitionFile(route, fileIndex);
        if (definitionFile) {
          this.addSignal(
            candidateMap,
            definitionFile,
            'ROUTE_DEFINITION_UNRESOLVED',
            `Route ${route} is defined here but its component could not be resolved`,
            [route],
          );
        }
      }
    }

    for (const [filePath, content] of fileIndex) {
      const isTestFile = /\.(test|spec)\.(tsx?|jsx?)$/.test(filePath);
      const pathTerms = filePath.toLowerCase().split(/[^a-z0-9]+/);
      const lowerContent = content.toLowerCase();

      if (!isTestFile) {
        for (const term of distinctive) {
          if (pathTerms.includes(term)) {
            this.addSignal(
              candidateMap,
              filePath,
              'FILENAME_MATCH',
              `Distinctive term "${term}" matches file path`,
              [term],
            );
          } else if (lowerContent.includes(term)) {
            this.addSignal(
              candidateMap,
              filePath,
              'KEYWORD_MATCH',
              `Distinctive term "${term}" found in source`,
              [term],
            );
          }
        }

        for (const term of generic) {
          if (lowerContent.includes(term)) {
            this.addSignal(
              candidateMap,
              filePath,
              'KEYWORD_MATCH',
              `Generic term "${term}" found in source`,
              [term],
              GENERIC_KEYWORD_WEIGHT,
            );
          }
        }
      }
    }

    this.applyDirectoryProximity(candidateMap, fileIndex);
    this.applyTestAssociations(candidateMap, fileIndex);

    const candidates = this.finalizeCandidates(candidateMap);
    const lowConfidence = this.isLowConfidence(candidates, evidence, routeOwners);
    const findings = this.buildFindings(candidates, evidence, routeOwners, lowConfidence);

    return {
      candidates,
      routeOwners,
      lowConfidence,
      findings,
    };
  }

  private async buildFileIndex(
    repoRoot: string,
    searchRoots: string[],
  ): Promise<Map<string, string>> {
    const index = new Map<string, string>();

    for (const root of searchRoots) {
      const absRoot = path.join(repoRoot, root);
      await this.walkSourceFiles(absRoot, root, index);
    }

    return index;
  }

  private async walkSourceFiles(
    absDir: string,
    relDir: string,
    index: Map<string, string>,
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (name === 'node_modules' || name === 'dist' || name === 'build' || name === '.git') {
        continue;
      }

      const absPath = path.join(absDir, name);
      const relPath = path.posix.join(relDir.replace(/\\/g, '/'), name);

      if (entry.isDirectory()) {
        await this.walkSourceFiles(absPath, relPath, index);
      } else if (entry.isFile()) {
        if (!/\.(tsx?|jsx?)$/.test(name)) continue;
        try {
          const stat = await fs.promises.stat(absPath);
          if (stat.size > MAX_FILE_BYTES) continue;
          const content = await fs.promises.readFile(absPath, 'utf-8');
          index.set(relPath, content);
        } catch {
          /* ignore unreadable files */
        }
      }
    }
  }

  private buildResolvedImportsIndex(
    repoRoot: string,
    fileIndex: Map<string, string>,
  ): Map<string, ResolvedImport[]> {
    const index = new Map<string, ResolvedImport[]>();
    for (const [filePath, content] of fileIndex) {
      const raw = parseImports(content);
      const resolved = raw.map((imp) => ({
        source: imp.source,
        names: imp.names,
        resolvedPath: resolveImportPath(repoRoot, filePath, imp.source),
      }));
      index.set(filePath, resolved);
    }
    return index;
  }

  private buildRouteOwners(
    repoRoot: string,
    fileIndex: Map<string, string>,
    importsByFile: Map<string, ResolvedImport[]>,
  ): Record<string, string | null> {
    const owners: Record<string, string | null> = {};

    for (const [filePath, content] of fileIndex) {
      if (!content.includes('<Route')) continue;
      const tags = parseRouteTags(content);
      const stack: string[] = [];

      for (const tag of tags) {
        if (tag.isClosing) {
          stack.pop();
          continue;
        }

        const parentPath = stack.length > 0 ? stack[stack.length - 1] : '';
        const absolutePath = combineRoutePath(parentPath, tag.path, tag.index);

        if (tag.element) {
          const componentName = extractComponentName(tag.element);
          if (componentName) {
            const componentFile = resolveComponentSource(
              filePath,
              componentName,
              importsByFile.get(filePath) ?? [],
            );
            if (componentFile) {
              owners[absolutePath] = componentFile;
            }
          }
        }

        if (!tag.isSelfClosing) {
          stack.push(absolutePath);
        }
      }
    }

    return owners;
  }

  private findRouteDefinitionFile(
    route: string,
    fileIndex: Map<string, string>,
  ): string | null {
    for (const [filePath, content] of fileIndex) {
      if (!content.includes('<Route')) continue;
      const tags = parseRouteTags(content);
      const stack: string[] = [];
      for (const tag of tags) {
        if (tag.isClosing) {
          stack.pop();
          continue;
        }
        const parentPath = stack.length > 0 ? stack[stack.length - 1] : '';
        const absolutePath = combineRoutePath(parentPath, tag.path, tag.index);
        if (absolutePath === route || route.startsWith(absolutePath + '/')) {
          return filePath;
        }
        if (!tag.isSelfClosing) stack.push(absolutePath);
      }
    }
    return null;
  }

  private followImports(
    startPath: string,
    importsByFile: Map<string, ResolvedImport[]>,
    candidateMap: Map<string, MutableCandidate>,
    currentDepth: number,
    maxDepth: number,
  ): void {
    if (currentDepth > maxDepth) return;

    const imports = importsByFile.get(startPath) ?? [];
    for (const imp of imports) {
      const resolved = imp.resolvedPath;
      if (!resolved) continue;

      const relationship: RepositoryRelationship =
        currentDepth === 1 ? 'IMPORTED_BY_ROUTE_OWNER' : 'IMPORTS_RELEVANT_FILE';
      this.addSignal(
        candidateMap,
        resolved,
        relationship,
        currentDepth === 1
          ? `Imported directly by route owner ${path.posix.basename(startPath)}`
          : `Imported by relevant file ${path.posix.basename(startPath)}`,
        [path.posix.basename(startPath)],
      );

      this.followImports(resolved, importsByFile, candidateMap, currentDepth + 1, maxDepth);
    }
  }

  private applyDirectoryProximity(
    candidateMap: Map<string, MutableCandidate>,
    fileIndex: Map<string, string>,
  ): void {
    const strong = Array.from(candidateMap.values()).filter((c) => c.score >= 50);
    const directories = new Map<string, MutableCandidate[]>();
    for (const c of strong) {
      const dir = path.posix.dirname(c.path);
      const list = directories.get(dir) ?? [];
      list.push(c);
      directories.set(dir, list);
    }

    for (const [filePath] of fileIndex) {
      if (candidateMap.has(filePath)) continue;
      const dir = path.posix.dirname(filePath);
      const neighbors = directories.get(dir);
      if (!neighbors || neighbors.length === 0) continue;
      this.addSignal(
        candidateMap,
        filePath,
        'DIRECTORY_PROXIMITY',
        `Same directory as strong candidate(s): ${neighbors.map((n) => path.posix.basename(n.path)).join(', ')}`,
        neighbors.map((n) => path.posix.basename(n.path)),
      );
    }
  }

  private applyTestAssociations(
    candidateMap: Map<string, MutableCandidate>,
    fileIndex: Map<string, string>,
  ): void {
    const testsBySubject = new Map<string, string>();
    for (const [filePath] of fileIndex) {
      const base = path.posix.basename(filePath);
      const match = base.match(/^(.+?)\.(test|spec)\.(tsx?|jsx?)$/);
      if (match) {
        testsBySubject.set(match[1]!, filePath);
      }
    }

    for (const candidate of candidateMap.values()) {
      if (candidate.score < 50) continue;
      const base = path.posix.basename(candidate.path, path.posix.extname(candidate.path));
      const testPath = testsBySubject.get(base);
      if (testPath) {
        this.addSignal(
          candidateMap,
          testPath,
          'TEST_FOR_CANDIDATE',
          `Test file for ${base}`,
          [base],
        );
      }
    }
  }

  private addSignal(
    candidateMap: Map<string, MutableCandidate>,
    filePath: string,
    relationship: RepositoryRelationship,
    reason: string,
    terms: string[],
    overrideWeight?: number,
  ): void {
    const normalized = filePath.replace(/\\/g, '/');
    let candidate = candidateMap.get(normalized);
    const signalScore = overrideWeight ?? SCORES[relationship];
    const cap = SIGNAL_CAPS[relationship];

    if (!candidate) {
      const initialScore = Math.min(signalScore, cap);
      candidate = {
        path: normalized,
        score: initialScore,
        reasons: [reason],
        terms: new Set(terms),
        relationship,
        maxSignalScore: signalScore,
        signalScores: new Map([[relationship, initialScore]]),
      };
      candidateMap.set(normalized, candidate);
      return;
    }

    const current = candidate.signalScores.get(relationship) ?? 0;
    const next = Math.min(cap, current + signalScore);
    const delta = next - current;
    if (delta <= 0) return;

    candidate.score += delta;
    candidate.signalScores.set(relationship, next);
    candidate.reasons.push(reason);
    for (const t of terms) candidate.terms.add(t);
    if (signalScore > candidate.maxSignalScore) {
      candidate.maxSignalScore = signalScore;
      candidate.relationship = relationship;
    }
  }

  private finalizeCandidates(candidateMap: Map<string, MutableCandidate>): RepositoryCandidate[] {
    const list = Array.from(candidateMap.values())
      .map((c): RepositoryCandidate => ({
        path: c.path,
        score: c.score,
        reasons: Array.from(new Set(c.reasons)),
        matchedTerms: Array.from(c.terms),
        relationship: c.relationship,
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    return list.slice(0, 12);
  }

  private isLowConfidence(
    candidates: RepositoryCandidate[],
    evidence: RepositoryExplorerInput['evidence'],
    routeOwners: Record<string, string | null>,
  ): boolean {
    if ((evidence.suspectedFiles?.length ?? 0) > 0) return false;
    const hasRouteOwner = Object.values(routeOwners).some((p) => p !== null);
    if (hasRouteOwner && candidates.length > 0 && candidates[0]!.score >= 70) return false;
    if (candidates.length === 0) return true;
    const topScore = candidates[0]!.score;
    if (topScore >= 50 && candidates.filter((c) => c.score >= 40).length >= 2) return false;
    if (topScore >= 40 && hasRouteOwner) return false;
    return true;
  }

  private buildFindings(
    candidates: RepositoryCandidate[],
    evidence: RepositoryExplorerInput['evidence'],
    routeOwners: Record<string, string | null>,
    lowConfidence: boolean,
  ): string[] {
    const findings: string[] = [];

    const relevantRoutes = new Set(evidence.affectedRoutes ?? []);
    const ownerEntries = Object.entries(routeOwners).filter(
      ([r, v]) => v !== null && relevantRoutes.has(r),
    );
    if (ownerEntries.length > 0) {
      findings.push(
        `Route ownership resolved: ${ownerEntries.map(([r, f]) => `${r} → ${path.posix.basename(f!)}`).join(', ')}`,
      );
    }

    if (lowConfidence) {
      findings.push('REPOSITORY_EVIDENCE_LOW_CONFIDENCE');
      return findings;
    }

    const top = candidates.slice(0, 5);
    if (top.length > 0) {
      findings.push(
        `Top repository candidates: ${top.map((c) => `${c.path} (${c.score})`).join('; ')}`,
      );
    } else {
      findings.push('No repository candidates discovered.');
    }

    return findings;
  }
}

function selectSearchRoots(): string[] {
  return [
    'apps/dashboard/cardbey-marketing-dashboard/src',
    'apps/core/cardbey-core/src',
    'packages',
  ];
}

interface RouteTag {
  isClosing: boolean;
  isSelfClosing: boolean;
  path?: string;
  index?: boolean;
  element?: string;
}

function parseRouteTags(content: string): RouteTag[] {
  const tags: RouteTag[] = [];
  let idx = 0;

  while (true) {
    const openIdx = content.indexOf('<Route', idx);
    const closeIdx = content.indexOf('</Route', idx);
    if (openIdx === -1 && closeIdx === -1) break;

    const nextIdx = openIdx === -1 ? closeIdx : closeIdx === -1 ? openIdx : Math.min(openIdx, closeIdx);
    const isClosing = content.startsWith('</Route', nextIdx);

    if (isClosing) {
      tags.push({ isClosing: true, isSelfClosing: false });
      idx = nextIdx + 7;
      continue;
    }

    const tagEnd = findTagEnd(content, openIdx);
    if (tagEnd === -1) {
      idx = openIdx + 6;
      continue;
    }

    const attrString = content.slice(openIdx + 6, tagEnd).trim();
    const attrs = parseAttributes(attrString);
    const isSelfClosing = attrString.endsWith('/') || content.charAt(tagEnd - 1) === '/';

    tags.push({
      isClosing: false,
      isSelfClosing,
      path: attrs.path,
      index: attrs.index,
      element: attrs.element,
    });

    idx = tagEnd + 1;
  }

  return tags;
}

function findTagEnd(content: string, start: number): number {
  let inSingle = false;
  let inDouble = false;
  let braceDepth = 0;

  for (let i = start + 6; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '{' && !inDouble && !inSingle) braceDepth++;
    else if (ch === '}' && !inDouble && !inSingle) braceDepth--;
    else if (ch === '>' && !inDouble && !inSingle && braceDepth === 0) {
      return i;
    }
  }
  return -1;
}

function parseAttributes(attrString: string): { path?: string; index?: boolean; element?: string } {
  const result: { path?: string; index?: boolean; element?: string } = {};
  const attrRegex = /\b(path|element|index)\b\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrString)) !== null) {
    const key = m[1] as 'path' | 'element' | 'index';
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (key === 'index') {
      result.index = value === 'true' || value === '{true}' || value === '';
    } else {
      result[key] = value;
    }
  }

  return result;
}

function combineRoutePath(parent: string, child: string | undefined, isIndex?: boolean): string {
  if (isIndex) return parent || '/';
  if (!child) return parent || '/';
  if (child.startsWith('/')) return child;
  if (!parent) return `/${child}`;
  return parent.endsWith('/') ? `${parent}${child}` : `${parent}/${child}`;
}

function extractComponentName(elementString: string): string | null {
  const trimmed = elementString.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const tagMatch = inner.match(/^<([A-Z]\w*)/);
    if (tagMatch) return tagMatch[1]!;
    const identMatch = inner.match(/^([A-Z]\w*)/);
    if (identMatch) return identMatch[1]!;
  }
  const tagMatch = trimmed.match(/^<([A-Z]\w*)/);
  if (tagMatch) return tagMatch[1]!;
  return null;
}

function resolveComponentSource(
  containingFile: string,
  componentName: string,
  imports: ResolvedImport[],
): string | null {
  for (const imp of imports) {
    if (!imp.names.includes(componentName)) continue;
    return imp.resolvedPath;
  }
  return null;
}

function resolveImportPath(repoRoot: string, containingFile: string, source: string): string | null {
  if (source.startsWith('.')) {
    const dir = path.posix.dirname(containingFile);
    const base = path.posix.join(dir, source).replace(/\\/g, '/');
    return resolveSourceWithExtensions(repoRoot, base);
  }

  if (source.startsWith('@/')) {
    const rootPrefix = findAllowedRootPrefix(containingFile);
    if (!rootPrefix) return null;
    const base = path.posix.join(rootPrefix, 'src', source.slice(2)).replace(/\\/g, '/');
    return resolveSourceWithExtensions(repoRoot, base);
  }

  return null;
}

function findAllowedRootPrefix(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const root of cardbeyRepositoryManifest.allowedRoots) {
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return root;
    }
  }
  return null;
}

function resolveSourceWithExtensions(repoRoot: string, base: string): string | null {
  const candidates: string[] = [base];
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(`${base}${ext}`);
  }
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.push(path.posix.join(base, `index${ext}`).replace(/\\/g, '/'));
  }

  for (const candidate of candidates) {
    try {
      const abs = path.join(repoRoot, candidate);
      const stat = fs.statSync(abs);
      if (stat.isFile()) return candidate.replace(/\\/g, '/');
    } catch {
      /* not found */
    }
  }
  return null;
}

interface RawImport {
  source: string;
  names: string[];
}

function parseImports(content: string): RawImport[] {
  const specs: RawImport[] = [];
  const regex =
    /^\s*import\s+(?:(\*\s+as\s+\w+)|(?:([\w$]+)\s*,\s*)?\{([^}]*)\}|([\w$]+))\s+from\s+['"]([^'"]+)['"];?/gm;

  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const source = m[5]!;
    const names: string[] = [];

    if (m[1]) {
      names.push(m[1].replace(/\*\s+as\s+/, '').trim());
    }
    if (m[2]) {
      names.push(m[2]);
    }
    if (m[4]) {
      names.push(m[4]);
    }
    if (m[3]) {
      for (const part of m[3].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const aliasMatch = trimmed.match(/^([\w$]+)\s+as\s+[\w$]+$/);
        names.push(aliasMatch ? aliasMatch[1]! : trimmed);
      }
    }

    specs.push({ source, names });
  }

  return specs;
}
