import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const moduleUrl = new URL('./ensureDatabaseUrl.js', import.meta.url).href;

function resolveDatabaseUrl(overrides) {
  const childEnv = { ...process.env };

  for (const key of [
    'DATABASE_URL',
    'NODE_ENV',
    'VITEST',
    'RENDER_EXTERNAL_URL',
    'RENDER_SERVICE_ID',
    'PERSISTENT_DISK_PATH',
    'PRISMA_CLIENT_ENGINE_TYPE',
  ]) {
    delete childEnv[key];
  }

  Object.assign(childEnv, overrides);

  const script = `
    await import(${JSON.stringify(moduleUrl)});
    console.log('DATABASE_URL_RESULT=' + process.env.DATABASE_URL);
  `;

  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      env: childEnv,
      encoding: 'utf8',
      timeout: 10_000,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Child process exited ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }

  const line = result.stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith('DATABASE_URL_RESULT='));

  if (!line) {
    throw new Error(`Missing DATABASE_URL result:\n${result.stdout}`);
  }

  return line.slice('DATABASE_URL_RESULT='.length);
}

describe('ensureDatabaseUrl', () => {
  it('preserves explicit PostgreSQL during a test API run', () => {
    const databaseUrl =
      'postgresql://cardbey_test:secret@127.0.0.1:55432/cardbey_gold_ci';

    expect(
      resolveDatabaseUrl({
        NODE_ENV: 'test',
        VITEST: 'true',
        DATABASE_URL: databaseUrl,
      }),
    ).toBe(databaseUrl);
  });

  it('pins ordinary Vitest runs to canonical SQLite', () => {
    const databaseUrl = resolveDatabaseUrl({
      NODE_ENV: 'test',
      VITEST: 'true',
      DATABASE_URL: 'file:./prisma/noncanonical-test.db',
    });

    const normalized = databaseUrl.replaceAll('\\', '/');

    expect(normalized).toContain('/prisma/test.db?');
    expect(normalized).toContain('busy_timeout=');
    expect(normalized).toContain('journal_mode=WAL');
  });
});
