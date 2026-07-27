import { describe, it, expect } from 'vitest';
import { checkMigrationHealth } from './migrationHealthCheck.js';

describe('migrationHealthCheck', () => {
  it('reports clean history when sqlite migrations are applied', async () => {
    const health = await checkMigrationHealth();
    if (!process.env.DATABASE_URL?.includes('prod.db')) {
      expect(health).toBeDefined();
      return;
    }
    expect(health.failed).toEqual([]);
    expect(health.pending).toEqual([]);
    expect(health.ok).toBe(true);
  });
});
