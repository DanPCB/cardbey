import { describe, it, expect } from 'vitest';
import { AutoLayoutAgent } from '../autoLayoutAgent.js';

describe('AutoLayoutAgent', () => {
  const agent = new AutoLayoutAgent();

  it('formats audit-style messy content with headers and flattened table', async () => {
    const messy = `Cardbey AI Capability Audit
Audit scope: apps/core/cardbey-core/src/lib/llm/, Performer intake (V1 + V2), conversation layer,
ReAct pipeline, PIL/expression layer, MCP, and dashboard client history handling.

Executive Summary
Cardbey has multiple LLM integration layers, but the primary Performer path (Intake V2) is not reasoning-native.
The dashboard calls POST /api/performer/intake/v2, which routes through a deterministic IntentReasoner (pattern/rules, no LLM).
LLM usage is limited to auxiliary paths: pre-intake chat gate, explanation, PIL concierge, build-store ReAct (opt-in),
and legacy V1 intake (still mounted at /api/performer/intake).

1. Capability Gap Matrix
Capability Current State Required State Gap Priority
Token Limits llmGateway default maxTokens=1000; call sites range 320–1200; dashboard truncates history to 6×400 chars; server caps at 10 turns; PIL output sliced to 600 chars Full context preserved; model-appropriate budgets (8k–32k+ for reasoning); no silent truncation High — reasoning context and outputs are clipped at multiple layers P0`;

    const { processed, type, stats } = await agent.process(messy);

    expect(processed).toMatch(/^# Cardbey AI Capability Audit/m);
    expect(processed).toContain('## Executive Summary');
    expect(processed).toContain('## 1. Capability Gap Matrix');
    expect(processed).toMatch(/\|\s*Capability\s*\|/);
    expect(processed).toContain('Current State');
    expect(processed).toContain('P0');
    expect(stats.lines).toBeGreaterThan(5);
    expect(['text', 'markdown', 'table']).toContain(type);
  });

  it('preserves markdown pipe tables', async () => {
    const input = `| A | B |\n|---|---|\n| 1 | 2 |`;
    const { processed } = await agent.process(input);
    expect(processed).toContain('| A');
    expect(processed).toContain('| 1');
  });

  it('detects list content type', async () => {
    const input = '- one\n- two\n- three';
    const { type, processed } = await agent.process(input);
    expect(type).toBe('list');
    expect(processed).toContain('- one');
  });

  it('returns stats for processed output', async () => {
    const { stats } = await agent.process('Audit scope: line one.\n\nFindings: line two.');
    expect(stats.chars).toBeGreaterThan(0);
    expect(stats.words).toBeGreaterThan(4);
    expect(stats.paragraphs).toBe(2);
  });
});
