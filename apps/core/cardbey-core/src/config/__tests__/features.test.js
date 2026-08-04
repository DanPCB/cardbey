import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Features, snapshotFeatures } from '../features.js';

describe('config/features', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('defaults decision loop authority to off', () => {
    delete process.env.INTAKE_DECISION_LOOP_AUTHORITY;
    expect(Features.decisionLoop.enabled).toBe(false);
  });

  it('enables decision loop when INTAKE_DECISION_LOOP_AUTHORITY=true', () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    expect(Features.decisionLoop.enabled).toBe(true);
  });

  it('defaults belief shadow to on', () => {
    delete process.env.INTAKE_BELIEF_SHADOW_ENABLED;
    expect(Features.belief.shadow).toBe(true);
  });

  it('snapshotFeatures returns plain values', () => {
    process.env.INTAKE_DECISION_LOOP_AUTHORITY = 'true';
    const snap = snapshotFeatures();
    expect(snap.decisionLoop.enabled).toBe(true);
    expect(typeof snap.decisionLoop.thresholds.low).toBe('number');
  });

  it('defaults USE_LLM_GATEWAY to on (Phase 0)', () => {
    delete process.env.USE_LLM_GATEWAY;
    expect(Features.llm.useGateway).toBe(true);
  });

  it('allows USE_LLM_GATEWAY=false rollback', () => {
    process.env.USE_LLM_GATEWAY = 'false';
    expect(Features.llm.useGateway).toBe(false);
  });

  it('defaults LLM provider to anthropic with openai fallback', () => {
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_FALLBACK_PROVIDER;
    expect(Features.llm.defaultProvider).toBe('anthropic');
    expect(Features.llm.fallbackProvider).toBe('openai');
  });

  it('includes llm in snapshotFeatures', () => {
    delete process.env.USE_LLM_GATEWAY;
    const snap = snapshotFeatures();
    expect(snap.llm.useGateway).toBe(true);
    expect(snap.llm.defaultProvider).toBeTruthy();
  });

  it('defaults PII redaction and kimi/groq provider config (Phase 1)', () => {
    delete process.env.ENABLE_PII_REDACTION;
    delete process.env.KIMI_ENABLED;
    delete process.env.GROQ_ENABLED;
    expect(Features.llm.piiRedaction).toBe(true);
    expect(Features.llm.providers.kimi.enabled).toBe(true);
    expect(Features.llm.providers.groq.enabled).toBe(true);
    expect(Features.llm.providers.kimi.defaultModel).toContain('kimi');
  });

  it('defaults multiAgent gateway provider to deepseek (Phase 2)', () => {
    delete process.env.MULTIAGENT_PROVIDER;
    delete process.env.MULTIAGENT_USE_GATEWAY;
    delete process.env.USE_LLM_GATEWAY;
    expect(Features.multiAgent.provider).toBe('deepseek');
    expect(Features.multiAgent.useGateway).toBe(true);
    expect(Features.intent.provider).toBe('deepseek');
  });
});
