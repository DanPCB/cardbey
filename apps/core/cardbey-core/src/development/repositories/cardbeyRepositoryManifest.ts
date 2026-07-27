/**
 * Cardbey repository manifest for governed development workspaces.
 */

import path from 'node:path';

const repoRoot = process.env.CARDBEY_REPO_ROOT || path.resolve(process.cwd(), '../../..');

export const cardbeyRepositoryManifest = {
  repositoryId: 'cardbey',
  defaultBranch: 'main',
  workspaceRoot: path.join(repoRoot, '.development-workspaces'),
  repoRoot,

  allowedRoots: [
    'apps/dashboard/cardbey-marketing-dashboard',
    'apps/core/cardbey-core',
    'packages',
  ],

  forbiddenPaths: [
    '.env',
    '.env.',
    'node_modules',
    'dist',
    'build',
    'secrets',
    'credentials',
  ],

  elevatedReviewPaths: [
    'apps/core/cardbey-core/src/auth',
    'apps/core/cardbey-core/prisma',
    'apps/core/cardbey-core/src/runtimeAuthority',
    '.github/workflows',
  ],

  allowedChecks: {
    dashboardBuild: {
      cwd: 'apps/dashboard/cardbey-marketing-dashboard',
      command: 'pnpm',
      args: ['exec', 'vite', 'build', '--minify=false'],
      timeoutMs: 180000,
    },
    dashboardTypecheck: {
      cwd: 'apps/dashboard/cardbey-marketing-dashboard',
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', 'src/components/development/'],
      timeoutMs: 180000,
    },
    dashboardTests: {
      cwd: 'apps/dashboard/cardbey-marketing-dashboard',
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', 'src/components/development/developmentConsoleRouting.test.tsx'],
      timeoutMs: 120000,
    },
    coreDevelopmentTests: {
      cwd: 'apps/core/cardbey-core',
      command: 'pnpm',
      args: ['exec', 'vitest', 'run', 'src/development/__tests__/developmentPhase2.test.ts'],
      timeoutMs: 120000,
    },
  },
} as const;

export type CardbeyCheckId = keyof typeof cardbeyRepositoryManifest.allowedChecks;

export function getManifestForRepository(repositoryId: string) {
  if (repositoryId !== cardbeyRepositoryManifest.repositoryId) {
    return null;
  }
  return cardbeyRepositoryManifest;
}
