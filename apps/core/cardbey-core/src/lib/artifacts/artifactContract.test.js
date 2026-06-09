import { describe, expect, it } from 'vitest';
import {
  assertArtifactTruthful,
  artifactReady,
  artifactUnavailable,
  deriveIntakeSuccessFromToolResult,
  isUsableArtifact,
  resolveIntakeMessageFromToolResult,
} from './artifactContract.js';

describe('artifactContract', () => {
  it('ready without URL is invalid', () => {
    expect(() =>
      artifactReady({
        type: 'video',
        url: null,
        previewUrl: null,
        message: 'Ready',
      }),
    ).toThrow();
  });

  it('unavailable artifact yields intake success false', () => {
    const artifact = artifactUnavailable({
      type: 'slideshow',
      message: 'Slideshow generation is not connected yet.',
    });
    const toolResult = {
      status: 'failed',
      output: { artifact, message: artifact.message },
      error: { code: 'X', message: artifact.message },
    };
    expect(deriveIntakeSuccessFromToolResult(toolResult)).toBe(false);
    expect(resolveIntakeMessageFromToolResult(toolResult)).not.toBe('Completed.');
    expect(resolveIntakeMessageFromToolResult(toolResult)).toContain('not connected');
  });

  it('ready artifact with url is usable', () => {
    const a = artifactReady({
      type: 'video',
      url: 'https://example.com/v.mp4',
      previewUrl: 'https://example.com/v.mp4',
    });
    expect(isUsableArtifact(a)).toBe(true);
    assertArtifactTruthful(a);
    expect(
      deriveIntakeSuccessFromToolResult({
        status: 'ok',
        output: { artifact: a },
      }),
    ).toBe(true);
  });

  it('processing artifact allows success true with processing message', () => {
    const toolResult = {
      status: 'ok',
      output: {
        artifact: {
          id: 'a-1',
          type: 'slideshow',
          status: 'processing',
          message: 'I started this and will show the artifact when it is ready.',
        },
      },
    };
    expect(deriveIntakeSuccessFromToolResult(toolResult)).toBe(true);
    expect(resolveIntakeMessageFromToolResult(toolResult)).toContain('started');
  });

  it('skill execution summary replaces generic Done message', () => {
    const toolResult = {
      status: 'ok',
      output: {
        skillExecution: {
          stepResults: {
            generate_execution_summary: {
              output: {
                summary: 'Created 2 product(s), 1 campaign(s), 6-week content calendar.',
                display: { type: 'document_ingestion_result' },
              },
            },
          },
        },
      },
    };
    expect(resolveIntakeMessageFromToolResult(toolResult)).toContain('Created 2 product(s)');
    expect(resolveIntakeMessageFromToolResult(toolResult)).not.toBe('Done.');
  });
});
