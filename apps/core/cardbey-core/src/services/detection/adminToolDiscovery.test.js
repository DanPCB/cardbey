import { describe, expect, it } from 'vitest';
import { detectAdminToolDiscoveryIssues } from './adminToolDiscovery.js';

function mockPrisma(rows) {
  return {
    telemetryNavigation: {
      findMany: async () => rows,
    },
  };
}

describe('adminToolDiscovery', () => {
  it('flags admin stuck on marketing with admin-tool searches', async () => {
    const rows = [
      { userId: 'a1', sessionId: 's1', userRole: 'admin', eventType: 'page.view', fromPath: '/dashboard', toPath: '/dashboard', searchQuery: null, createdAt: new Date() },
      { userId: 'a1', sessionId: 's1', userRole: 'admin', eventType: 'page.view', fromPath: '/dashboard', toPath: '/catalog', searchQuery: null, createdAt: new Date() },
      { userId: 'a1', sessionId: 's1', userRole: 'admin', eventType: 'page.view', fromPath: '/catalog', toPath: '/orders', searchQuery: null, createdAt: new Date() },
      { userId: 'a1', sessionId: 's1', userRole: 'admin', eventType: 'page.view', fromPath: '/orders', toPath: '/dashboard', searchQuery: null, createdAt: new Date() },
      { userId: 'a1', sessionId: 's1', userRole: 'admin', eventType: 'search.query', fromPath: '/dashboard', toPath: null, searchQuery: 'control tower', createdAt: new Date() },
    ];
    const result = await detectAdminToolDiscoveryIssues(mockPrisma(rows), { windowHours: 24 });
    expect(result.problematicCount).toBeGreaterThan(0);
    expect(result.problematic[0].searchQueries).toContain('control tower');
  });
});
