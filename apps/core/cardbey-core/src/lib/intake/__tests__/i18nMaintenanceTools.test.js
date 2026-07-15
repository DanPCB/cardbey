import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  ensureDashboardI18nReady,
  getDashboardPackageRoot,
} from '../i18nMaintenanceTools.js';

describe('i18nMaintenanceTools', () => {
  it('resolves dashboard package with i18n.js', () => {
    const root = getDashboardPackageRoot();
    expect(fs.existsSync(path.join(root, 'src/i18n.js'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'scripts/i18n-detect.mjs'))).toBe(true);
  });

  it('ensureDashboardI18nReady resolves an existing checkout', async () => {
    const ready = await ensureDashboardI18nReady();
    expect(ready.dashboardRoot).toBeTruthy();
    expect(fs.existsSync(path.join(ready.dashboardRoot, 'src/i18n.js'))).toBe(true);
    expect(['submodule', 'env', 'cache', 'seed', 'fetched']).toContain(ready.source);
  });
});
