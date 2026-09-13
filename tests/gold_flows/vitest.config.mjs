import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(configDirectory, '..', '..');
const coreRoot = path.join(repositoryRoot, 'apps', 'core', 'cardbey-core');

export default {
  root: repositoryRoot,
  resolve: {
    alias: {
      'node-fetch': path.join(coreRoot, 'node_modules', 'node-fetch', 'src', 'index.js'),
      '../../node_modules/.prisma/client-gen/index.js': path.join(
        coreRoot,
        'node_modules',
        '.prisma',
        'client-gen',
        'index.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/gold_flows/**/*.test.js'],
    setupFiles: [],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
};