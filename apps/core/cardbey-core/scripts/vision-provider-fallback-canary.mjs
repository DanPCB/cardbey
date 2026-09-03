/**
 * Vision Provider Fallback V1 — extract-card canary (local or staging Core).
 *
 * Usage:
 *   node scripts/vision-provider-fallback-canary.mjs --base http://127.0.0.1:3001 --mode primary
 *   node scripts/vision-provider-fallback-canary.mjs --base http://127.0.0.1:3001 --mode force-primary
 *   node scripts/vision-provider-fallback-canary.mjs --base https://cardbey-core-staging.onrender.com --mode primary
 *
 * Does not print secrets. Writes JSON evidence under docs/reports/evidence/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const base = String(arg('base', 'http://127.0.0.1:3001')).replace(/\/$/, '');
const mode = String(arg('mode', 'primary'));
const outDir = path.join(ROOT, 'docs/reports/evidence');
fs.mkdirSync(outDir, { recursive: true });

async function buildHpCardDataUrl() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="900" height="520" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="520" fill="#f7f4ef"/>
  <rect x="40" y="40" width="820" height="440" fill="#ffffff" stroke="#222" stroke-width="4"/>
  <text x="80" y="140" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#111">HP Services</text>
  <text x="80" y="210" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#333">HEATING &amp; COOLING &amp; ELECTRICAL</text>
  <text x="80" y="270" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#444">Maintenance, Servicing &amp; Installation</text>
  <text x="80" y="340" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#111">04 8765 4321</text>
  <text x="80" y="390" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#111">info@hpservices.example</text>
  <text x="80" y="440" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#111">www.hpservices.example</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function guestToken() {
  const res = await fetch(`${base}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.token) {
    throw new Error(`guest auth failed: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.token;
}

async function extractCard(token, cardImageDataUrl, extraBody = {}) {
  const res = await fetch(`${base}/api/missions/extract-card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cardImageDataUrl, ...extraBody }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const started = new Date().toISOString();
  const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
  const token = await guestToken();
  const cardImageDataUrl = await buildHpCardDataUrl();
  const extraBody =
    mode === 'force-primary'
      ? { ocrCanaryForcePrimary: arg('force', 'quota') }
      : mode === 'force-all'
        ? { ocrCanaryForcePrimary: 'quota', ocrCanaryForceSecondary: 'error' }
        : {};
  // force-all secondary not implemented via body — use ANTHROPIC_DISABLED for secondary-fail proof locally
  const { status, json } = await extractCard(token, cardImageDataUrl, extraBody);

  const evidence = {
    started,
    finished: new Date().toISOString(),
    mode,
    base,
    coreShaHint: process.env.CANARY_CORE_SHA || null,
    health,
    httpStatus: status,
    ok: json?.ok === true,
    businessName: json?.businessName ?? null,
    location: json?.location ?? null,
    vertical: json?.vertical ?? null,
    confidence: json?.confidence ?? null,
    providerUsed: json?.providerUsed ?? null,
    didFallback: json?.didFallback ?? null,
    classification: json?.classification ?? json?.error ?? null,
    attempts: json?.attempts ?? null,
    message: json?.message ?? null,
    warning: json?.warning ?? null,
  };

  const stamp = started.replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `vision-fallback-canary-${mode}-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ outPath, ...evidence }, null, 2));

  if (mode === 'primary') {
    if (!(status === 200 && evidence.ok && /hp\s*services/i.test(String(evidence.businessName || '')))) {
      process.exitCode = 2;
    }
  } else if (mode === 'force-primary') {
    // Expect success via fallback OR honest unavailable — never OCR_WEAK empty confidence framing alone.
    if (status === 200 && evidence.ok && /hp\s*services/i.test(String(evidence.businessName || ''))) {
      if (evidence.didFallback !== true && evidence.providerUsed === 'openai_vision') {
        console.error('force-primary expected fallback provider, got openai_vision without fallback');
        process.exitCode = 3;
      }
    } else if (status === 503 && evidence.classification === 'VISION_PROVIDERS_UNAVAILABLE') {
      // acceptable when Anthropic/Google unavailable
    } else {
      process.exitCode = 2;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
