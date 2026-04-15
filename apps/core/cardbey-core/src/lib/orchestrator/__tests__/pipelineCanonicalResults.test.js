/**
 * Wave 2 — canonical outputs + dual-write merge (pure helpers; no DB).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mergeCanonicalOutputs,
  mergeDualWriteMetadata,
  mergeRunnerOutputsIntoMetadataStepOutputs,
  buildStoreOrchestrationPipelineWrites,
  recoverStoreOrchestrationPollWrites,
  ORCHESTRA_STORE_BUILD_STEP_KEY,
  isPipelineOutputDualWriteEnabled,
} from '../pipelineCanonicalResults.js';

describe('mergeCanonicalOutputs', () => {
  it('shallow-merges patch over existing', () => {
    expect(mergeCanonicalOutputs({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('treats non-object existing as empty', () => {
    expect(mergeCanonicalOutputs(null, { jobId: 'j1' })).toEqual({ jobId: 'j1' });
  });
});

describe('mergeDualWriteMetadata', () => {
  it('preserves other stepOutputs keys and sets mirror key', () => {
    const meta = mergeDualWriteMetadata(
      { stepOutputs: { create_promotion: { phase: 'x' } }, storeId: 's1' },
      ORCHESTRA_STORE_BUILD_STEP_KEY,
      { jobId: 'j', draftId: 'd' },
    );
    expect(meta.storeId).toBe('s1');
    expect(meta.stepOutputs.create_promotion).toEqual({ phase: 'x' });
    expect(meta.stepOutputs[ORCHESTRA_STORE_BUILD_STEP_KEY]).toEqual({ jobId: 'j', draftId: 'd' });
  });
});

describe('mergeRunnerOutputsIntoMetadataStepOutputs', () => {
  it('merges tool keys into stepOutputs', () => {
    const meta = mergeRunnerOutputsIntoMetadataStepOutputs(
      { stepOutputs: { market_research: { a: 1 } }, foo: 'bar' },
      { market_research: { a: 2 }, consensus: { ok: true } },
    );
    expect(meta.foo).toBe('bar');
    expect(meta.stepOutputs.market_research).toEqual({ a: 2 });
    expect(meta.stepOutputs.consensus).toEqual({ ok: true });
  });
});

describe('buildStoreOrchestrationPipelineWrites', () => {
  it('returns only outputsJson when dualWrite false', () => {
    const r = buildStoreOrchestrationPipelineWrites({
      existingOutputsJson: { x: 1 },
      existingMetadataJson: { stepOutputs: {} },
      outputsPatch: { jobId: 'j' },
      dualWrite: false,
    });
    expect(r).toEqual({ outputsJson: { x: 1, jobId: 'j' } });
    expect(r.metadataJson).toBeUndefined();
  });

  it('adds metadataJson when dualWrite true', () => {
    const r = buildStoreOrchestrationPipelineWrites({
      existingOutputsJson: {},
      existingMetadataJson: { k: 'v' },
      outputsPatch: { jobId: 'j' },
      dualWrite: true,
    });
    expect(r.outputsJson).toEqual({ jobId: 'j' });
    expect(r.metadataJson.stepOutputs[ORCHESTRA_STORE_BUILD_STEP_KEY]).toEqual({ jobId: 'j' });
    expect(r.metadataJson.k).toBe('v');
  });
});

describe('recoverStoreOrchestrationPollWrites', () => {
  const prev = process.env.PIPELINE_OUTPUT_DUAL_WRITE;

  afterEach(() => {
    if (prev === undefined) delete process.env.PIPELINE_OUTPUT_DUAL_WRITE;
    else process.env.PIPELINE_OUTPUT_DUAL_WRITE = prev;
  });

  it('merges mirror when dual-write on and DB row exists', async () => {
    process.env.PIPELINE_OUTPUT_DUAL_WRITE = 'true';
    const prisma = {
      missionPipeline: {
        findUnique: async () => ({
          outputsJson: { jobId: 'j1', draftId: 'd1' },
          metadataJson: { source: 'missions_store_run', stepOutputs: { other: { x: 1 } } },
        }),
      },
    };
    const r = await recoverStoreOrchestrationPollWrites(prisma, 'm1', { result: { ok: true } }, null);
    expect(r.outputsJson).toEqual({ jobId: 'j1', draftId: 'd1', result: { ok: true } });
    expect(r.metadataJson?.stepOutputs?.other).toEqual({ x: 1 });
    expect(r.metadataJson?.stepOutputs?.[ORCHESTRA_STORE_BUILD_STEP_KEY]).toEqual({
      jobId: 'j1',
      draftId: 'd1',
      result: { ok: true },
    });
  });

  it('uses outputsFallback when DB returns null', async () => {
    process.env.PIPELINE_OUTPUT_DUAL_WRITE = 'true';
    const prisma = {
      missionPipeline: {
        findUnique: async () => null,
      },
    };
    const fb = { jobId: 'j2', draftId: 'd2' };
    const r = await recoverStoreOrchestrationPollWrites(prisma, 'm1', { result: { ok: false } }, fb);
    expect(r.outputsJson).toEqual({ jobId: 'j2', draftId: 'd2', result: { ok: false } });
    expect(r.metadataJson?.stepOutputs?.[ORCHESTRA_STORE_BUILD_STEP_KEY]).toEqual({
      jobId: 'j2',
      draftId: 'd2',
      result: { ok: false },
    });
  });
});

describe('isPipelineOutputDualWriteEnabled', () => {
  const prev = process.env.PIPELINE_OUTPUT_DUAL_WRITE;

  beforeEach(() => {
    delete process.env.PIPELINE_OUTPUT_DUAL_WRITE;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PIPELINE_OUTPUT_DUAL_WRITE;
    else process.env.PIPELINE_OUTPUT_DUAL_WRITE = prev;
  });

  it('is true only when set to true', () => {
    expect(isPipelineOutputDualWriteEnabled()).toBe(false);
    process.env.PIPELINE_OUTPUT_DUAL_WRITE = 'true';
    expect(isPipelineOutputDualWriteEnabled()).toBe(true);
    process.env.PIPELINE_OUTPUT_DUAL_WRITE = 'TRUE';
    expect(isPipelineOutputDualWriteEnabled()).toBe(true);
  });
});
