import { describe, expect, it } from 'vitest';
import { mapDiscoveryToCodeFixPayloads } from './buildAdminDiscoveryCodeFixPayload.js';

describe('mapDiscoveryToCodeFixPayloads', () => {
  it('converts medium-severity detection rows to code fix payloads', () => {
    const payloads = mapDiscoveryToCodeFixPayloads({
      windowHours: 24,
      sessionsAnalyzed: 2,
      problematicCount: 1,
      suggestedGlobalFix: null,
      problematic: [
        {
          userId: 'admin@test.com',
          sessionId: 'test-session',
          marketingVisits: 5,
          consoleVisits: 0,
          searchQueries: ['control tower'],
          frustrationSignals: 0,
          severity: 'medium',
          suggestedFix: 'Add Control Tower link to marketing sidebar for admin users',
        },
      ],
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0].category).toBe('admin_tool_discovery');
    expect(payloads[0].sessionId).toBe('test-session');
    expect(payloads[0].filePaths.some((p) => p.includes('CanonicalSidebar'))).toBe(true);
    expect(String(payloads[0].description)).toContain('Add Control Tower link');
  });

  it('skips high severity session rows', () => {
    const payloads = mapDiscoveryToCodeFixPayloads({
      windowHours: 24,
      sessionsAnalyzed: 1,
      problematicCount: 1,
      suggestedGlobalFix: null,
      problematic: [
        {
          userId: 'admin@test.com',
          sessionId: 'high-session',
          severity: 'high',
          suggestedFix: 'Something critical',
        },
      ],
    });

    expect(payloads).toHaveLength(0);
  });

  it('adds a global payload when suggestedGlobalFix is present', () => {
    const payloads = mapDiscoveryToCodeFixPayloads({
      windowHours: 24,
      sessionsAnalyzed: 3,
      problematicCount: 3,
      suggestedGlobalFix: 'Enable admin console link on marketing sidebar',
      problematic: [
        {
          userId: 'a1',
          sessionId: 's1',
          severity: 'medium',
          suggestedFix: 'Per-session fix',
          searchQueries: ['console'],
        },
      ],
    });

    expect(payloads.length).toBeGreaterThanOrEqual(2);
    const globalPayload = payloads.find((p) => p.issueId === 'admin_tool_discovery:global');
    expect(globalPayload).toBeDefined();
    expect(String(globalPayload.description)).toContain('Enable admin console link');
  });

  it('filters by issueId when requested', () => {
    const payloads = mapDiscoveryToCodeFixPayloads(
      {
        windowHours: 24,
        sessionsAnalyzed: 1,
        problematicCount: 1,
        suggestedGlobalFix: 'Global fix',
        problematic: [
          {
            userId: 'a1',
            sessionId: 's1',
            severity: 'medium',
            suggestedFix: 'Per-session fix',
          },
        ],
      },
      { issueId: 'admin_tool_discovery:s1' },
    );

    expect(payloads).toHaveLength(1);
    expect(payloads[0].issueId).toBe('admin_tool_discovery:s1');
  });
});
