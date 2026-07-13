// apps/core/cardbey-core/src/development/manifest/RepositoryManifest.ts

export interface RepositoryManifest {
  id: string;
  name: string;
  root: string;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  installCommand: string[];
  workspaceCommands: {
    lint: string[];
    typecheck: string[];
    test: string[];
    build: string[];
    prismaGenerate: string[];
    migrationValidate: string[];
  };
  frontend: {
    testCommand: string[];
    buildCommand: string[];
    devCommand: string[];
  };
  backend: {
    testCommand: string[];
    buildCommand: string[];
    devCommand: string[];
  };
  forbiddenPaths: string[];
  elevatedReviewPaths: string[];
  database: {
    provider: 'sqlite' | 'postgresql' | 'mysql';
    schemaPath: string;
    migrationCommand: string[];
    rollbackCommand: string[];
  };
  environments: {
    staging: {
      url: string;
      deployCommand: string[];
    };
    production: {
      url: string;
      deployCommand: string[];
    };
  };
}

export const CARDBEY_MANIFEST: RepositoryManifest = {
  id: 'cardbey',
  name: 'Cardbey Monorepo',
  root: '.',
  packageManager: 'npm',
  installCommand: ['npm', 'install'],
  workspaceCommands: {
    lint: ['npm', 'run', 'lint'],
    typecheck: ['npm', 'run', 'typecheck'],
    test: ['npm', 'run', 'test'],
    build: ['npm', 'run', 'build'],
    prismaGenerate: ['npx', 'prisma', 'generate'],
    migrationValidate: ['npx', 'prisma', 'migrate', 'status']
  },
  frontend: {
    testCommand: ['npm', 'run', 'test:frontend'],
    buildCommand: ['npm', 'run', 'build:frontend'],
    devCommand: ['npm', 'run', 'dev:frontend']
  },
  backend: {
    testCommand: ['npm', 'run', 'test:backend'],
    buildCommand: ['npm', 'run', 'build:backend'],
    devCommand: ['npm', 'run', 'dev:backend']
  },
  forbiddenPaths: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.env',
    '.env.*',
    '*.key',
    '*.pem',
    '*.crt',
    'secrets',
    'credentials'
  ],
  elevatedReviewPaths: [
    'src/auth',
    'src/payment',
    'src/security',
    'src/runtime',
    'prisma/schema.prisma',
    'src/database/migrations'
  ],
  database: {
    provider: 'sqlite',
    schemaPath: 'prisma/schema.prisma',
    migrationCommand: ['npx', 'prisma', 'migrate', 'deploy'],
    rollbackCommand: ['npx', 'prisma', 'migrate', 'reset', '--force']
  },
  environments: {
    staging: {
      url: 'https://staging.cardbey.com',
      deployCommand: ['npm', 'run', 'deploy:staging']
    },
    production: {
      url: 'https://cardbey.com',
      deployCommand: ['npm', 'run', 'deploy:production']
    }
  }
};

export class RepositoryManifestManager {
  private manifests: Map<string, RepositoryManifest> = new Map();

  constructor() {
    // Register the Cardbey manifest
    this.register(CARDBEY_MANIFEST);
  }

  register(manifest: RepositoryManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  getManifest(id: string): RepositoryManifest | null {
    return this.manifests.get(id) || null;
  }

  listManifests(): RepositoryManifest[] {
    return Array.from(this.manifests.values());
  }

  getCommandForType(
    manifestId: string,
    type: 'install' | 'lint' | 'typecheck' | 'test' | 'build' | 'prismaGenerate' | 'migrationValidate' | 'frontendTest' | 'frontendBuild' | 'backendTest' | 'backendBuild'
  ): string[] | null {
    const manifest = this.getManifest(manifestId);
    if (!manifest) return null;

    switch (type) {
      case 'install':
        return manifest.installCommand;
      case 'lint':
        return manifest.workspaceCommands.lint;
      case 'typecheck':
        return manifest.workspaceCommands.typecheck;
      case 'test':
        return manifest.workspaceCommands.test;
      case 'build':
        return manifest.workspaceCommands.build;
      case 'prismaGenerate':
        return manifest.workspaceCommands.prismaGenerate;
      case 'migrationValidate':
        return manifest.workspaceCommands.migrationValidate;
      case 'frontendTest':
        return manifest.frontend.testCommand;
      case 'frontendBuild':
        return manifest.frontend.buildCommand;
      case 'backendTest':
        return manifest.backend.testCommand;
      case 'backendBuild':
        return manifest.backend.buildCommand;
      default:
        return null;
    }
  }

  isPathForbidden(manifestId: string, path: string): boolean {
    const manifest = this.getManifest(manifestId);
    if (!manifest) return true;

    return manifest.forbiddenPaths.some(forbidden => {
      if (forbidden.includes('*')) {
        const pattern = forbidden.replace(/\*/g, '.*');
        return new RegExp(pattern).test(path);
      }
      return path.includes(forbidden);
    });
  }

  requiresElevatedReview(manifestId: string, path: string): boolean {
    const manifest = this.getManifest(manifestId);
    if (!manifest) return true;

    return manifest.elevatedReviewPaths.some(elevated => {
      if (elevated.includes('*')) {
        const pattern = elevated.replace(/\*/g, '.*');
        return new RegExp(pattern).test(path);
      }
      return path.includes(elevated);
    });
  }
}