/**
 * Fail if production JS still contains syntax/APIs known-broken on Chrome 68.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let failed = 0;

function check(name, ok, detail) {
  if (ok) console.log('PASS', name, detail || '');
  else {
    failed += 1;
    console.error('FAIL', name, detail || '');
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

check('dist exists', existsSync(dist));

const indexPath = join(dist, 'index.html');
check('index.html', existsSync(indexPath));
if (!existsSync(indexPath)) {
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
check('no type=module entry', !/<script[^>]*type=["']module["'][^>]*src=/i.test(html));
check('classic entry present', /<script[^>]+src=["']\.\/assets\/[^"']+\.js["']/i.test(html));
check('ENTRY_SCRIPT_REQUESTED hook', /ENTRY_SCRIPT_REQUESTED/.test(html));
check('ENTRY_SCRIPT_LOADED hook', /ENTRY_SCRIPT_LOADED/.test(html));
check('ENTRY_SCRIPT_ERROR hook', /ENTRY_SCRIPT_ERROR/.test(html));
check('__cardbeyBootStage defined', /__cardbeyBootStage/.test(html));
check('relative assets only', !/src=["']\/assets\//.test(html) && !/href=["']\/assets\//.test(html));
check('no localhost', !/https?:\/\/(localhost|127\.0\.0\.1)/i.test(html));
check('config injected', /__CARDBEY_DISPLAY_CONFIG__/.test(html));
check('build id injected', /__CARDBEY_BUILD_ID__/.test(html));

const scriptSrcs = [];
const linkHrefs = [];
html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (_m, src) => {
  scriptSrcs.push(src);
  return _m;
});
html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (_m, href) => {
  linkHrefs.push(href);
  return _m;
});

for (const src of scriptSrcs) {
  if (/^https?:/i.test(src)) continue;
  const abs = join(dist, src.replace(/^\.\//, ''));
  const ok = existsSync(abs);
  const size = ok ? statSync(abs).size : 0;
  const hash = ok ? sha256(readFileSync(abs)) : '';
  check('script exists ' + src, ok, ok ? size + 'B sha=' + hash : '');
  if (ok) check('script non-empty ' + src, size > 100, String(size));
}

for (const href of linkHrefs) {
  if (/^https?:/i.test(href) || href.startsWith('data:')) continue;
  const abs = join(dist, href.replace(/^\.\//, ''));
  check('stylesheet exists ' + href, existsSync(abs));
}

const assetsDir = join(dist, 'assets');
const jsFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => /\.js$/i.test(f))
  : [];
check('js assets present', jsFiles.length > 0, String(jsFiles.length));

const banned = [
  { name: 'optional chaining ?.', re: /\?\./ },
  { name: 'nullish coalescing ??', re: /\?\?(?!=)/ },
  { name: 'logical assign', re: /\|\|=|&&=|\?\?=/ },
  { name: 'private fields', re: /\bthis\.#[A-Za-z_]/ },
  { name: 'top-level await', re: /(^|\n)\s*await\s+/ },
  { name: 'import.meta', re: /import\.meta/ },
  { name: 'replaceAll(', re: /\.replaceAll\s*\(/ },
  { name: 'Object.fromEntries', re: /Object\.fromEntries/ },
  { name: 'Promise.allSettled', re: /Promise\.allSettled/ },
  { name: 'structuredClone', re: /structuredClone\s*\(/ },
  { name: 'crypto.randomUUID', re: /crypto\.randomUUID/ },
  { name: 'Array.prototype.at call', re: /\.at\s*\(\s*-?\d/ },
];

for (const file of jsFiles) {
  const text = readFileSync(join(assetsDir, file), 'utf8');
  check('no localhost in ' + file, !/https?:\/\/(localhost|127\.0\.0\.1)/i.test(text));
  check(
    'has globalThis polyfill',
    /typeof globalThis>"u"&&\(window\.globalThis=window\)|typeof globalThis===["']undefined["']/.test(
      text,
    ),
  );
  for (const rule of banned) {
    // Allow crypto.randomUUID only inside a guarded optional call pattern already lowered
    if (rule.name === 'crypto.randomUUID' && /randomUUID\?/.test(text)) {
      // still fail if bare crypto.randomUUID( appears
    }
    const hits = text.match(rule.re);
    check('chrome68 forbid ' + rule.name + ' in ' + file, !hits, hits ? hits[0] : '');
  }
}

const buildIdMatch = html.match(/__CARDBEY_BUILD_ID__\s*=\s*"([^"]+)"/);
check('build id parseable', Boolean(buildIdMatch), buildIdMatch ? buildIdMatch[1] : '');

if (failed > 0) {
  console.error('validate-dist failed:', failed);
  process.exit(1);
}
console.log('validate-dist: all checks passed');
