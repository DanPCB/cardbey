/**
 * Architectural guard: consumers must not import provider adapters directly.
 * Allowed: Consumer → URI public API/client → Federation → Provider adapter
 *
 * Phase 4B: no grandfathered consumer discovery paths.
 * Ops intake (UL sync) and federation adapters remain allowlisted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(__dirname, '..');
const dashRoot = path.resolve(coreRoot, '../../dashboard/cardbey-marketing-dashboard');

/** Federation / ops adapters may talk to providers — not product consumers. */
const ALLOWED_CORE_PREFIXES = [
  path.join(coreRoot, 'src', 'services', 'universalResourceIntelligence'),
  path.join(coreRoot, 'src', 'services', 'universalLibrary', 'pexelsLibrarySync.js'),
  path.join(coreRoot, 'src', 'services', 'media', 'PexelsAdapter.js'),
  path.join(coreRoot, 'src', 'services', 'menuVisualAgent', 'pexelsService'),
  path.join(coreRoot, 'src', 'lib', 'seedLibrary', 'adapters'),
  path.join(coreRoot, 'src', 'lib', 'music'),
  path.join(coreRoot, 'src', 'lib', 'audio'),
  path.join(coreRoot, 'src', 'utils', 'pexelsVideoSelect'),
];

/** Dashboard modules that implement the URI client / URI content adapter. */
const ALLOWED_DASH_PREFIXES = [
  path.join(dashRoot, 'src', 'lib', 'universalResourceIntelligence'),
  // Thin URI adapter for ContentAsset shape (must not import Pexels adapters)
  path.join(dashRoot, 'src', 'lib', 'assets', 'contentSourceProvider.ts'),
  path.join(dashRoot, 'src', 'lib', 'assets', 'businessAssetSuggestions.ts'),
  path.join(dashRoot, 'src', 'lib', 'assets', 'contentAssetTypes.ts'),
  // Brand logo APIs (not stock federation) + iconify helper usage inside providerRegistry
  path.join(dashRoot, 'src', 'lib', 'assets', 'providerRegistry.ts'),
  // Binary retrieval proxy after URI selection (not discovery)
  path.join(dashRoot, 'src', 'lib', 'assets', 'contentAssetFetch.ts'),
];

const GUARDED_CORE_GLOBS = [
  path.join(coreRoot, 'src', 'services', 'capabilityEngine'),
  path.join(coreRoot, 'src', 'services', 'performer'),
  path.join(coreRoot, 'src', 'services', 'businessCreation'),
  path.join(coreRoot, 'src', 'services', 'creatorStudio'),
  // Phase 5 Path C — media tool executors must use URI, not VideoSearchService / pexelsService
  path.join(coreRoot, 'src', 'lib', 'toolExecutors', 'media'),
];

const GUARDED_DASH_GLOBS = [
  path.join(dashRoot, 'src', 'app', 'console', 'performer'),
  path.join(dashRoot, 'src', 'lib', 'universalLibrary'),
  path.join(dashRoot, 'src', 'features', 'content-studio'),
  path.join(dashRoot, 'src', 'features', 'contents-studio'),
  path.join(dashRoot, 'src', 'components', 'mini-website'),
  path.join(dashRoot, 'src', 'components', 'mediaLibrary'),
  path.join(dashRoot, 'src', 'pages', 'agent-chat'),
  path.join(dashRoot, 'src', 'pages', 'mediaLibrary'),
  path.join(dashRoot, 'src', 'pages', 'library'),
  path.join(dashRoot, 'src', 'lib', 'assets'),
];

/** Direct provider / legacy discovery imports — forbidden in consumers. */
const DISALLOWED_IMPORT_RE =
  /from\s+['"][^'"]*(pexelsLibrarySync|PexelsAdapter|pexelsService|VideoSearchService|openverseMusicClient|openverseSourceClient|seedLibrary\/adapters\/pexels|images\/providers\/pexels|assets\/providers\/pexelsAdapter)['"]|import\s*\(\s*['"][^'"]*(pexelsLibrarySync|PexelsAdapter|pexelsService|VideoSearchService|openverseMusicClient|images\/providers\/pexels|assets\/providers\/pexelsAdapter)['"]\s*\)|\bsearchPexelsPhotos\b|\bsearchPexelsVideos\b|\/api\/assets\/(search|photos|videos)\b/g;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '__tests__') continue;
    if (ent.name.endsWith('.test.ts') || ent.name.endsWith('.test.tsx') || ent.name.endsWith('.test.js')) {
      continue;
    }
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(js|ts|tsx|mjs)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

function isAllowed(file) {
  const n = path.normalize(file);
  return [...ALLOWED_CORE_PREFIXES, ...ALLOWED_DASH_PREFIXES].some(
    (p) => n === path.normalize(p) || n.startsWith(path.normalize(p) + path.sep) || n.startsWith(path.normalize(p)),
  );
}

const violations = [];

for (const root of [...GUARDED_CORE_GLOBS, ...GUARDED_DASH_GLOBS]) {
  for (const file of walk(root)) {
    if (isAllowed(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const matches = text.match(DISALLOWED_IMPORT_RE);
    if (matches?.length) {
      violations.push({
        file: path.relative(coreRoot, file).replace(/\\/g, '/'),
        matches: [...new Set(matches)].slice(0, 8),
      });
    }
  }
}

// contentSourceProvider must not import Pexels search helpers
const csp = path.join(dashRoot, 'src', 'lib', 'assets', 'contentSourceProvider.ts');
if (fs.existsSync(csp)) {
  const text = fs.readFileSync(csp, 'utf8');
  if (/searchPexelsPhotos|searchPexelsVideos|searchContentAssetsVideos/.test(text)) {
    violations.push({
      file: path.relative(coreRoot, csp).replace(/\\/g, '/'),
      matches: ['contentSourceProvider_must_not_call_legacy_provider_search'],
    });
  }
  if (!/uriContentSearch|searchContentAssetsViaUri|universalResourceIntelligence/.test(text)) {
    violations.push({
      file: path.relative(coreRoot, csp).replace(/\\/g, '/'),
      matches: ['contentSourceProvider_must_use_uri_adapter'],
    });
  }
}

// URI package: no direct vendor AI SDKs
const uriDir = path.join(coreRoot, 'src', 'services', 'universalResourceIntelligence');
for (const file of walk(uriDir)) {
  const text = fs.readFileSync(file, 'utf8');
  if (/from\s+['"]openai['"]|from\s+['"]@anthropic|from\s+['"]@google\/generative-ai['"]/.test(text)) {
    violations.push({
      file: path.relative(coreRoot, file).replace(/\\/g, '/'),
      matches: ['direct_vendor_ai_sdk'],
    });
  }
}

if (violations.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'uri_consumer_boundary_violation',
        rule: 'Consumer → URI → Federation → Provider only',
        grandfatheredConsumerPaths: false,
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      verdictHint: 'URI_CONSUMER_CUTOVER_COMPLETE',
      rule: 'Consumer → URI → Federation → Provider',
      grandfatheredConsumerPaths: false,
      scanned: {
        coreGuards: GUARDED_CORE_GLOBS.map((p) => path.relative(coreRoot, p)),
        dashGuards: GUARDED_DASH_GLOBS.map((p) => path.relative(dashRoot, p)),
      },
      note: 'UL sync + Provider SDK adapters remain federation-side allowlist only — not consumer discovery. Path C media tools must use URI.',
    },
    null,
    2,
  ),
);
