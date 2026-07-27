/**
 * Package dist/ into a webOS .ipk when ares-package is available.
 * Always stages dist/ as a packaging-ready app root.
 *
 * Usage:
 *   node scripts/package-ipk.mjs
 *   node scripts/package-ipk.mjs --staged-only
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outDir = join(root, 'release');
const stagedOnly = process.argv.includes('--staged-only');

function fail(message) {
  console.error('[package-ipk]', message);
  process.exit(1);
}

function requireDist() {
  const appinfoPath = join(dist, 'appinfo.json');
  const indexPath = join(dist, 'index.html');
  if (!existsSync(appinfoPath)) fail('dist/appinfo.json missing. Run `pnpm build` first.');
  if (!existsSync(indexPath)) fail('dist/index.html missing. Run `pnpm build` first.');

  const appinfo = JSON.parse(readFileSync(appinfoPath, 'utf8'));
  if (appinfo.id !== 'com.cardbey.display') {
    fail('Unexpected app id: ' + appinfo.id);
  }
  if (appinfo.type !== 'web') fail('appinfo.type must be "web"');
  if (appinfo.main !== 'index.html') fail('appinfo.main must be "index.html" at package root');

  for (const name of [appinfo.icon, appinfo.largeIcon, appinfo.main].filter(Boolean)) {
    if (!existsSync(join(dist, name))) {
      fail('Referenced package file missing: ' + name);
    }
  }

  const indexHtml = readFileSync(indexPath, 'utf8');
  if (!/cardbey-boot|Cardbey Player starting/i.test(indexHtml)) {
    fail('dist/index.html missing early boot diagnostic');
  }
  if (/src=["']\/assets\//.test(indexHtml) || /href=["']\/assets\//.test(indexHtml)) {
    fail('dist/index.html uses absolute /assets paths (must be relative ./assets)');
  }
  if (/type=["']module["'][^>]*src=/i.test(indexHtml)) {
    fail('dist/index.html still has type=module entry (webOS requires classic script)');
  }
  if (!/ENTRY_SCRIPT_LOADED/.test(indexHtml)) {
    fail('dist/index.html missing ENTRY_SCRIPT_LOADED hook');
  }
  if (!/\.\/assets\//.test(indexHtml) && !/assets\//.test(indexHtml)) {
    fail('dist/index.html does not reference bundled assets');
  }
  if (/https?:\/\/(localhost|127\.0\.0\.1)/i.test(indexHtml)) {
    fail('dist/index.html contains localhost URL');
  }
  if (!/__CARDBEY_DISPLAY_CONFIG__/.test(indexHtml)) {
    fail('dist/index.html missing injected __CARDBEY_DISPLAY_CONFIG__');
  }
  if (/apiBaseUrl["']?\s*:\s*["']\s*["']/.test(indexHtml)) {
    fail('Injected apiBaseUrl is empty');
  }

  // Walk JS chunks for absolute asset roots and localhost
  const assetsDir = join(dist, 'assets');
  if (!existsSync(assetsDir)) fail('dist/assets missing');
  const files = readdirSync(assetsDir);
  if (files.length === 0) fail('dist/assets is empty');

  for (const file of files) {
    if (!/\.(js|css|html)$/i.test(file)) continue;
    const text = readFileSync(join(assetsDir, file), 'utf8');
    if (/https?:\/\/(localhost|127\.0\.0\.1)/i.test(text)) {
      fail('localhost URL found in ' + file);
    }
  }

  return appinfo;
}

function findAresPackage() {
  const probe = spawnSync('ares-package', ['--version'], {
    encoding: 'utf8',
    shell: true,
  });
  if (probe.status === 0) return 'ares-package';
  return null;
}

const appinfo = requireDist();
mkdirSync(outDir, { recursive: true });

const stageNote = {
  appId: appinfo.id,
  version: appinfo.version,
  stagedAt: new Date().toISOString(),
  packageRoot: dist,
  note: 'Pass this directory to `ares-package -n ./dist -o ./release` on a machine with webOS CLI.',
};
writeFileSync(join(outDir, 'package-stage.json'), JSON.stringify(stageNote, null, 2) + '\n');
console.log('[package-ipk] Staged package root validated at dist/');

if (stagedOnly) {
  console.log('Skipped ares-package (--staged-only).');
  process.exit(0);
}

const ares = findAresPackage();
if (!ares) {
  fail(
    [
      'ares-package not found on PATH.',
      'Install LG webOS TV CLI (ares-cli), then re-run `pnpm package`.',
      'Packaging-ready root is ready at dist/.',
      'Example: ares-package -n ./dist -o ./release',
    ].join('\n'),
  );
}

const result = spawnSync(ares, ['-n', dist, '-o', outDir], {
  encoding: 'utf8',
  shell: true,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exit(result.status == null ? 1 : result.status);
}

console.log('IPK packaging complete → ' + outDir);
const junk = join(outDir, 'dist');
if (existsSync(junk)) rmSync(junk, { recursive: true, force: true });
