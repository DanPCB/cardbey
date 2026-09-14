import fs from 'node:fs';
import path from 'node:path';
import { readRepositoryFile } from '../repositoryTools.js';
import type { RepositoryCandidate, RepositoryRelationship } from './repository/RepositoryExplorer.js';
import type { DevelopmentMission } from '../../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../../types/DevelopmentEvidence.js';
import {
  extractDistinctiveTerms,
  extractConstraintPhrases,
} from './termExtraction.js';

function isDirectoryHint(repoRoot: string, filePath: string): boolean {
  if (filePath.endsWith('/')) return true;
  try {
    const stat = fs.statSync(path.join(repoRoot, filePath));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export interface ChangeSurfaceSelection {
  changeTargets: string[];
  contextFiles: string[];
  testTargets: string[];
  lowRelevance: string[];
  lowConfidence: boolean;
  findings: string[];
}

export interface ChangeSurfaceSelectorInput {
  mission: DevelopmentMission;
  evidence: DevelopmentEvidence;
  candidates: RepositoryCandidate[];
  repoRoot: string;
}

export interface ChangeSurfaceSelector {
  select(input: ChangeSurfaceSelectorInput): Promise<ChangeSurfaceSelection>;
}

const RENDERING_PATTERNS = [
  /<[A-Z][A-Za-z0-9]*/, // JSX component tag
  /\.map\s*\(/, // array mapping in JSX/render
  /\.filter\s*\(/,
  /return\s*\(?\s*</, // return JSX
  /=\>\s*\(?\s*</, // arrow returning JSX
];

export class RepositoryChangeSurfaceSelector implements ChangeSurfaceSelector {
  async select(input: ChangeSurfaceSelectorInput): Promise<ChangeSurfaceSelection> {
    const { mission, evidence, candidates, repoRoot } = input;

    const distinctive = extractDistinctiveTerms(mission, evidence);
    const constraintPhrases = extractConstraintPhrases(mission);
    const changeTargets: string[] = [];
    const contextFiles: string[] = [];
    const testTargets: string[] = [];
    const lowRelevance: string[] = [];

    for (const candidate of candidates) {
      const classification = await this.classifyCandidate(candidate, distinctive, constraintPhrases, repoRoot);
      switch (classification) {
        case 'CHANGE_TARGET':
          changeTargets.push(candidate.path);
          break;
        case 'CONTEXT':
          contextFiles.push(candidate.path);
          break;
        case 'TEST_TARGET':
          testTargets.push(candidate.path);
          break;
        case 'LOW_RELEVANCE':
          lowRelevance.push(candidate.path);
          break;
      }
    }

    const testsForTargets = await this.discoverTestsForTargets(repoRoot, changeTargets);
    for (const testPath of testsForTargets) {
      if (!testTargets.includes(testPath)) {
        testTargets.push(testPath);
      }
    }

    const deduped = dedupeSurface({
      changeTargets,
      contextFiles,
      testTargets,
      lowRelevance,
    });

    const lowConfidence = deduped.changeTargets.length === 0;
    const findings = this.buildFindings(deduped, lowConfidence);

    return {
      ...deduped,
      lowConfidence,
      findings,
    };
  }

  private async classifyCandidate(
    candidate: RepositoryCandidate,
    distinctiveTerms: string[],
    constraintPhrases: string[],
    repoRoot: string,
  ): Promise<'CHANGE_TARGET' | 'CONTEXT' | 'TEST_TARGET' | 'LOW_RELEVANCE'> {
    if (matchesNegativeConstraint(candidate.path, constraintPhrases)) {
      return 'CONTEXT';
    }

    switch (candidate.relationship) {
      case 'SUSPECTED_FILE':
        // A directory path supplied as a suspected file is a discovery scope /
        // context hint, not a literal file modification target.
        if (isDirectoryHint(repoRoot, candidate.path)) {
          return 'CONTEXT';
        }
        return 'CHANGE_TARGET';

      case 'ROUTE_OWNER':
        // Route ownership anchors the feature surface. The page that renders the
        // affected route is the default modification target unless a negative
        // constraint explicitly excludes it.
        return 'CHANGE_TARGET';

      case 'IMPORTED_BY_ROUTE_OWNER': {
        // Structural reachability provides context by default. Promote to a
        // change target only when the imported file is part of the UI/feature
        // graph (component/page/hook) AND its filename/path identity strongly
        // matches a distinctive mission term. Service/API/utility dependencies
        // are never promoted merely because the route owner imports them.
        if (isServiceOrApiDependency(candidate.path)) {
          return 'CONTEXT';
        }
        if (!isComponentLike(candidate.path)) {
          return 'CONTEXT';
        }
        return pathMatchesDistinctiveTerms(candidate.path, distinctiveTerms) ? 'CHANGE_TARGET' : 'CONTEXT';
      }

      case 'IMPORTS_RELEVANT_FILE':
        return 'CONTEXT';

      case 'TEST_FOR_CANDIDATE': {
        const subject = this.extractTestSubject(candidate.reasons);
        return subject ? 'TEST_TARGET' : 'LOW_RELEVANCE';
      }

      case 'FILENAME_MATCH': {
        // Filename-only matches lack structural connection to a route owner;
        // keep them as context only if they look like a component and contain
        // behavioral evidence, otherwise discard as low relevance.
        if (isComponentLike(candidate.path) && (await this.hasBehavioralEvidence(candidate.path, distinctiveTerms, repoRoot))) {
          return 'CONTEXT';
        }
        return 'LOW_RELEVANCE';
      }

      case 'DIRECTORY_PROXIMITY':
      case 'KEYWORD_MATCH':
      default:
        return 'LOW_RELEVANCE';
    }
  }

  private async hasBehavioralEvidence(
    filePath: string,
    distinctiveTerms: string[],
    repoRoot: string,
  ): Promise<boolean> {
    if (distinctiveTerms.length === 0) return false;

    let content: string;
    try {
      content = await readRepositoryFile(repoRoot, filePath);
    } catch {
      return false;
    }

    const lowerTerms = distinctiveTerms.map((t) => t.toLowerCase());
    const lines = content.split('\n');

    for (const line of lines) {
      const lower = line.toLowerCase();
      const hasTerm = lowerTerms.some((t) => lower.includes(t));
      if (!hasTerm) continue;

      if (RENDERING_PATTERNS.some((p) => p.test(line))) {
        return true;
      }
    }

    return false;
  }

  private extractTestSubject(reasons: string[]): string | null {
    for (const reason of reasons) {
      const match = reason.match(/Test file for\s+(.+)$/i);
      if (match) return match[1]!.trim();
    }
    return null;
  }

  private async discoverTestsForTargets(
    repoRoot: string,
    changeTargets: string[],
  ): Promise<string[]> {
    const tests: string[] = [];
    for (const target of changeTargets) {
      const dir = path.posix.dirname(target);
      const absDir = path.join(repoRoot, dir);
      const base = path.posix.basename(target, path.posix.extname(target));

      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(absDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const match = entry.match(/^(.+?)\.(test|spec)\.(tsx?|jsx?)$/);
        if (!match) continue;
        if (match[1] === base) {
          tests.push(path.posix.join(dir, entry).replace(/\\/g, '/'));
        }
      }
    }
    return tests;
  }

  private buildFindings(
    surface: Pick<ChangeSurfaceSelection, 'changeTargets' | 'contextFiles' | 'testTargets' | 'lowRelevance'>,
    lowConfidence: boolean,
  ): string[] {
    const findings: string[] = [];

    if (surface.changeTargets.length > 0) {
      findings.push(`Change targets: ${surface.changeTargets.join(', ')}`);
    }
    if (surface.contextFiles.length > 0) {
      findings.push(`Context files: ${surface.contextFiles.join(', ')}`);
    }
    if (surface.testTargets.length > 0) {
      findings.push(`Test targets: ${surface.testTargets.join(', ')}`);
    }
    if (surface.lowRelevance.length > 0) {
      findings.push(`Low relevance candidates excluded: ${surface.lowRelevance.length}`);
    }

    if (lowConfidence) {
      findings.push('CHANGE_SURFACE_LOW_CONFIDENCE');
    }

    return findings;
  }
}

function isComponentLike(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('/pages/') ||
    lower.includes('/components/') ||
    lower.includes('/hooks/') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.jsx')
  );
}

function isServiceOrApiDependency(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('/services/') ||
    lower.includes('/lib/api') ||
    lower.includes('/lib/storage') ||
    lower.includes('/utils/') ||
    lower.includes('/helpers/')
  );
}

function matchesNegativeConstraint(filePath: string, constraintPhrases: string[]): boolean {
  if (constraintPhrases.length === 0) return false;
  const lowerPath = filePath.toLowerCase();
  return constraintPhrases.some((phrase) => {
    const words = phrase.split(/\s+/);
    return words.some((word) => lowerPath.includes(word));
  });
}

function pathMatchesDistinctiveTerms(filePath: string, distinctiveTerms: string[]): boolean {
  if (distinctiveTerms.length === 0) return false;
  const split = filePath
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return distinctiveTerms.some((t) => split.includes(t.toLowerCase()));
}

function deduped<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function dedupeSurface(
  surface: Pick<ChangeSurfaceSelection, 'changeTargets' | 'contextFiles' | 'testTargets' | 'lowRelevance'>,
): Pick<ChangeSurfaceSelection, 'changeTargets' | 'contextFiles' | 'testTargets' | 'lowRelevance'> {
  return {
    changeTargets: deduped(surface.changeTargets),
    contextFiles: deduped(surface.contextFiles.filter((c) => !surface.changeTargets.includes(c) && !surface.testTargets.includes(c))),
    testTargets: deduped(surface.testTargets.filter((t) => !surface.changeTargets.includes(t))),
    lowRelevance: deduped(surface.lowRelevance),
  };
}
