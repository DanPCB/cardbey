import { describe, it, expect } from 'vitest';
import {
  buildCanonicalCodeFixStepOutput,
  buildCanonicalCodeFixErrorOutput,
  resolveCodeFixProposedPatchForApply,
  CODE_FIX_NATIVE_CONSTRAINTS,
} from '../codeFixCanonicalOutput.js';

describe('code_fix canonical output (server)', () => {
  it('buildCanonicalCodeFixStepOutput maps flat analysis fields to nested proposal + constraints', () => {
    const canonical = buildCanonicalCodeFixStepOutput({
      phase: 'awaiting_approval',
      tool: 'code_fix',
      rootCause: 'Null ref in handler',
      filesToChange: ['src/foo.js'],
      proposedPatches: [
        { filePath: 'src/foo.js', oldStr: 'a', newStr: 'b', description: 'Fix null check' },
      ],
      proposedPatchUnified: 'diff --git a/foo',
      confidence: 0.8,
    });

    expect(canonical.phase).toBe('awaiting_approval');
    expect(canonical.tool).toBe('code_fix');
    expect(canonical.confidence).toBe(0.8);
    expect(canonical.constraints).toEqual({ ...CODE_FIX_NATIVE_CONSTRAINTS });
    const proposal = canonical.proposal;
    expect(proposal).toBeDefined();
    expect(proposal.diagnosis).toBe('Null ref in handler');
    expect(proposal.affectedFiles).toEqual(['src/foo.js']);
    expect(proposal.likelyRootCause).toEqual(['Null ref in handler']);
    expect(proposal.proposedChanges).toEqual(['Fix null check']);
    expect(proposal.unifiedDiff).toBe('diff --git a/foo');
    expect(proposal.riskLevel).toBe('low');
  });

  it('merged persisted shape keeps legacy flat fields for confirm/apply (simulated)', () => {
    const proposedPatch = { filePath: 'src/foo.js', oldStr: 'old', newStr: 'new' };
    const proposedPatches = [proposedPatch];
    const canonical = buildCanonicalCodeFixStepOutput({
      phase: 'awaiting_approval',
      rootCause: 'Bug',
      filesToChange: ['src/foo.js'],
      proposedPatches,
      proposedPatchUnified: '',
      confidence: 0.5,
    });
    const persisted = {
      ...canonical,
      rootCause: 'Bug',
      filesToChange: ['src/foo.js'],
      proposedPatch,
      proposedPatches,
      proposedPatchUnified: '',
      confidence: 0.5,
      bugDescription: 'desc',
      hadFileContents: true,
    };
    expect(resolveCodeFixProposedPatchForApply(persisted).filePath).toBe('src/foo.js');
    expect(resolveCodeFixProposedPatchForApply(persisted).oldStr).toBe('old');
  });

  it('resolveCodeFixProposedPatchForApply falls back to proposedPatches when proposedPatch empty', () => {
    const cf = {
      phase: 'awaiting_approval',
      proposedPatch: {},
      proposedPatches: [{ filePath: 'b.js', oldStr: 'x', newStr: 'y' }],
    };
    const p = resolveCodeFixProposedPatchForApply(cf);
    expect(p.filePath).toBe('b.js');
    expect(p.oldStr).toBe('x');
    expect(p.newStr).toBe('y');
  });

  it('buildCanonicalCodeFixErrorOutput is additive-friendly for HTTP body', () => {
    const err = buildCanonicalCodeFixErrorOutput('LLM timeout', 'timeout');
    expect(err.phase).toBe('error');
    expect(err.tool).toBe('code_fix');
    expect(err.message).toBe('LLM timeout');
    expect(err.error).toEqual({ code: 'timeout', message: 'LLM timeout' });
    expect(err.constraints).toEqual({ ...CODE_FIX_NATIVE_CONSTRAINTS });
  });

  it('resolveCodeFixProposedPatchForApply prefers storeContentPatch V1', () => {
    const cf = {
      storeContentPatch: {
        kind: 'store_content_patch',
        version: 1,
        targetField: 'heroTitle',
        newText: 'MIMI WEB',
        sourceDescription: 'fix headline',
        legacyDetector: true,
      },
      proposedPatch: { filePath: 'store:heroTitle', oldStr: 'noise', newStr: 'ignored' },
    };
    const p = resolveCodeFixProposedPatchForApply(cf);
    expect(p.filePath).toBe('store:heroTitle');
    expect(p.oldStr).toBe('');
    expect(p.newStr).toBe('MIMI WEB');
  });

  it('resolveCodeFixProposedPatchForApply allows store: path with newStr and empty oldStr', () => {
    const cf = {
      proposedPatch: { filePath: 'store:heroTitle', oldStr: '', newStr: 'Hello' },
    };
    const p = resolveCodeFixProposedPatchForApply(cf);
    expect(p.filePath).toBe('store:heroTitle');
    expect(p.newStr).toBe('Hello');
  });
});
