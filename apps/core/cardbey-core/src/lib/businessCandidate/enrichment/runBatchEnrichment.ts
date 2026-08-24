/**
 * Batch runner for multi-source candidate enrichment.
 * Protected Batch 0 skip lives HERE in the loop (not only in routes/scripts).
 */

import cuid from 'cuid';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BusinessCandidateRecord } from '../types.js';
import { listBusinessCandidatesByBatch } from '../candidateRepository.js';
import { PROTECTED_BATCH_IDS } from './constants.js';
import { enrichCandidateMultiSource } from './multiSourceEnrichmentAgent.js';
import type { MultiSourceBatchResult, MultiSourceEnrichmentResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..', '..');

export function isProtectedEnrichmentBatch(batchId: string | null | undefined): boolean {
  if (!batchId) return false;
  return (PROTECTED_BATCH_IDS as readonly string[]).includes(batchId);
}

function logWarn(message: string): void {
  console.warn(`[multi-source-enrichment] ${message}`);
}

export async function runMultiSourceEnrichmentBatch(params: {
  batchId: string;
  enrichmentRunId?: string;
  dryRun?: boolean;
  candidateIds?: string[];
  writeReport?: boolean;
  maxCandidates?: number;
}): Promise<MultiSourceBatchResult> {
  const batchId = String(params.batchId ?? '').trim();
  if (!batchId) {
    throw new Error('batchId is required');
  }

  if (isProtectedEnrichmentBatch(batchId)) {
    throw new Error(`Refusing to enrich protected batch ${batchId}`);
  }

  const enrichmentRunId = params.enrichmentRunId?.trim() || cuid();
  const startedAt = new Date().toISOString();
  const dryRun = params.dryRun === true;
  const maxCandidates = Math.min(Math.max(params.maxCandidates ?? 25, 1), 25);

  let candidates = await listBusinessCandidatesByBatch(batchId);
  if (!candidates.length) {
    throw new Error(
      `INVENTORY_EMPTY: no BusinessCandidate rows for batchId=${batchId}. Run inventory recovery before enrichment.`,
    );
  }
  if (params.candidateIds?.length) {
    const allow = new Set(params.candidateIds);
    candidates = candidates.filter((c) => allow.has(c.id));
  }
  if (candidates.length > maxCandidates) {
    candidates = candidates.slice(0, maxCandidates);
    logWarn(`Capped batch to maxCandidates=${maxCandidates}`);
  }

  const results: MultiSourceEnrichmentResult[] = [];
  const dryRunProposals: unknown[] = [];

  for (const candidate of candidates) {
    // Hard skip — must live in the agent loop so scripts cannot bypass.
    if (isProtectedEnrichmentBatch(candidate.batchId)) {
      logWarn(
        `Skipping ${candidate.name ?? candidate.id} — protected batch ${candidate.batchId}`,
      );
      results.push({
        candidateId: candidate.id,
        businessName: candidate.name,
        enrichmentRunId,
        status: 'SKIPPED',
        category: candidate.category ?? candidate.businessType,
        descriptionLength: 0,
        heroImageSource: null,
        biStatus: candidate.biStatus === 'generated' ? 'generated' : 'not_generated',
        abn: candidate.abn ?? null,
        sourcesUsed: [],
        highestTierReached: null,
        flags: ['PROTECTED_BATCH'],
        enrichmentDurationMs: 0,
        websiteFetches: 0,
        claudeCalls: 0,
        message: `Protected batch ${candidate.batchId}`,
      });
      continue;
    }

    const before = {
      description: candidate.description ?? null,
      category: candidate.category ?? null,
      heroImageUrl: candidate.heroImageUrl ?? null,
      biStatus: candidate.biStatus ?? null,
      status: candidate.status,
      batchId: candidate.batchId,
      seedId: candidate.seedId,
    };

    const { result, candidate: after } = await enrichCandidateMultiSource({
      candidate,
      enrichmentRunId,
      dryRun,
    });
    results.push(result);

    if (dryRun) {
      dryRunProposals.push({
        mode: 'DRY_RUN',
        candidateId: candidate.id,
        businessName: candidate.name,
        before,
        proposed: {
          description: after.description ?? null,
          category: after.category ?? null,
          heroImageUrl: after.heroImageUrl ?? null,
          heroImageSource: after.heroImageSource ?? null,
          biStatus: after.biStatus ?? null,
          tags: after.tags ?? null,
          abn: after.abn ?? null,
          openingHours: after.openingHours ?? null,
        },
        result,
        note: 'Dry-run proposals are not canonical. Do not promote without explicit live run.',
      });
    }

    console.log(
      JSON.stringify({
        mode: dryRun ? 'DRY_RUN' : 'LIVE',
        candidateId: result.candidateId,
        businessName: result.businessName,
        status: result.status,
        category: result.category,
        descriptionLength: result.descriptionLength,
        heroImageSource: result.heroImageSource,
        biStatus: result.biStatus,
        abn: result.abn,
        sourcesUsed: result.sourcesUsed,
        highestTierReached: result.highestTierReached,
        flags: result.flags,
        enrichmentDurationMs: result.enrichmentDurationMs,
      }),
    );
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    total: results.length,
    enriched: results.filter((r) => r.status === 'ENRICHED').length,
    partial: results.filter((r) => r.status === 'PARTIAL').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    timeout: results.filter((r) => r.status === 'TIMEOUT').length,
  };

  const batchResult: MultiSourceBatchResult = {
    enrichmentRunId,
    batchId,
    startedAt,
    finishedAt,
    results,
    summary,
  };

  if (params.writeReport !== false) {
    await writeBatchReport(batchResult, dryRun ? { mode: 'DRY_RUN', proposals: dryRunProposals } : undefined);
  }

  return batchResult;
}

async function writeBatchReport(
  batch: MultiSourceBatchResult,
  dryRunExtra?: { mode: 'DRY_RUN'; proposals: unknown[] },
): Promise<string> {
  const stamp = batch.finishedAt.replace(/[:.]/g, '').slice(0, 15);
  const reportsDir = path.join(REPO_ROOT, 'docs', 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const prefix = dryRunExtra?.mode === 'DRY_RUN' ? 'ENRICHMENT_MULTISOURCE_DRYRUN' : 'ENRICHMENT_MULTISOURCE';
  const file = path.join(
    reportsDir,
    `${prefix}_${batch.batchId}_${stamp}.md`,
  );

  const sourceCounts = new Map<string, number>();
  const heroCounts = new Map<string, number>();
  const flagCounts = new Map<string, number>();
  for (const r of batch.results) {
    for (const s of r.sourcesUsed) {
      sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
    }
    const hs = r.heroImageSource ?? 'missing';
    heroCounts.set(hs, (heroCounts.get(hs) ?? 0) + 1);
    for (const f of r.flags) {
      flagCounts.set(f, (flagCounts.get(f) ?? 0) + 1);
    }
  }

  const qaAttention = batch.results.filter((r) =>
    r.flags.some((f) => ['ABN_CANCELLED', 'THIN_DATA', 'NO_WEBSITE', 'PROTECTED_BATCH'].includes(f)),
  );

  const ranked = [...batch.results]
    .filter((r) => r.status === 'ENRICHED' || r.status === 'PARTIAL')
    .sort((a, b) => {
      const score = (r: MultiSourceEnrichmentResult) =>
        (r.status === 'ENRICHED' ? 100 : 0) +
        r.descriptionLength +
        (r.heroImageSource ? 20 : 0) +
        (r.abn ? 10 : 0) -
        r.flags.length * 5;
      return score(b) - score(a);
    });

  const md = `# Multi-Source Enrichment Report

- **enrichmentRunId:** \`${batch.enrichmentRunId}\`
- **batchId:** \`${batch.batchId}\`
- **startedAt:** ${batch.startedAt}
- **finishedAt:** ${batch.finishedAt}

## 1. Batch summary

| Status | Count |
|--------|------:|
| Total | ${batch.summary.total} |
| ENRICHED | ${batch.summary.enriched} |
| PARTIAL | ${batch.summary.partial} |
| SKIPPED | ${batch.summary.skipped} |
| TIMEOUT | ${batch.summary.timeout} |

## 2. Source distribution

${[...sourceCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n') || '_none_'}

## 3. Hero image source breakdown

${[...heroCounts.entries()]
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n') || '_none_'}

## 4. Flags summary

${[...flagCounts.entries()]
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join('\n') || '_none_'}

## 5. Records requiring manual QA attention

${qaAttention.length
  ? qaAttention
      .map((r) => `- \`${r.candidateId}\` — ${r.businessName ?? '(unnamed)'} — flags: ${r.flags.join(', ')}`)
      .join('\n')
  : '_none_'}

## 6. Recommended QA approval order (highest confidence first)

${ranked.length
  ? ranked
      .map(
        (r, i) =>
          `${i + 1}. \`${r.candidateId}\` — ${r.businessName ?? '(unnamed)'} — ${r.status} — descWords=${r.descriptionLength} — hero=${r.heroImageSource ?? 'none'}`,
      )
      .join('\n')
  : '_none_'}

${dryRunExtra?.mode === 'DRY_RUN'
  ? `## 7. DRY_RUN isolation

- **mode:** \`DRY_RUN\`
- Canonical candidate fields were **not** mutated on disk.
- Dry-run provenance (if any) is isolated to \`enriched-field-provenance.dry-run.json\`.
- Proposals JSON: see companion \`.proposals.json\`
- Do **not** promote dry-run evidence as accepted canonical evidence.
`
  : ''}
`;

  await fs.writeFile(file, md, 'utf8');
  if (dryRunExtra?.mode === 'DRY_RUN') {
    await fs.writeFile(
      file.replace(/\.md$/, '.proposals.json'),
      `${JSON.stringify({ mode: 'DRY_RUN', enrichmentRunId: batch.enrichmentRunId, proposals: dryRunExtra.proposals }, null, 2)}\n`,
      'utf8',
    );
  }
  console.log(`[multi-source-enrichment] Wrote report ${file}`);
  return file;
}

/** Enrich a provided in-memory list (tests / single-candidate admin). Still applies Batch 0 freeze. */
export async function runMultiSourceEnrichmentOnCandidates(params: {
  candidates: BusinessCandidateRecord[];
  enrichmentRunId?: string;
  dryRun?: boolean;
  writeReport?: boolean;
  batchIdForReport?: string;
}): Promise<MultiSourceBatchResult> {
  const enrichmentRunId = params.enrichmentRunId?.trim() || cuid();
  const startedAt = new Date().toISOString();
  const results: MultiSourceEnrichmentResult[] = [];

  for (const candidate of params.candidates) {
    if (isProtectedEnrichmentBatch(candidate.batchId)) {
      logWarn(
        `Skipping ${candidate.name ?? candidate.id} — protected batch ${candidate.batchId}`,
      );
      results.push({
        candidateId: candidate.id,
        businessName: candidate.name,
        enrichmentRunId,
        status: 'SKIPPED',
        category: candidate.category ?? candidate.businessType,
        descriptionLength: 0,
        heroImageSource: null,
        biStatus: 'not_generated',
        abn: null,
        sourcesUsed: [],
        highestTierReached: null,
        flags: ['PROTECTED_BATCH'],
        enrichmentDurationMs: 0,
        websiteFetches: 0,
        claudeCalls: 0,
        message: `Protected batch ${candidate.batchId}`,
      });
      continue;
    }

    const { result } = await enrichCandidateMultiSource({
      candidate,
      enrichmentRunId,
      dryRun: params.dryRun === true,
    });
    results.push(result);
  }

  const finishedAt = new Date().toISOString();
  const batchResult: MultiSourceBatchResult = {
    enrichmentRunId,
    batchId: params.batchIdForReport ?? params.candidates[0]?.batchId ?? 'UNKNOWN',
    startedAt,
    finishedAt,
    results,
    summary: {
      total: results.length,
      enriched: results.filter((r) => r.status === 'ENRICHED').length,
      partial: results.filter((r) => r.status === 'PARTIAL').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      timeout: results.filter((r) => r.status === 'TIMEOUT').length,
    },
  };

  if (params.writeReport) {
    await writeBatchReport(batchResult);
  }

  return batchResult;
}
