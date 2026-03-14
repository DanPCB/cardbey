/**
 * Diff tmp/draft_authed.json vs tmp/draft_anon.json (same jobId/generationRunId).
 * Run: node tmp/diff_draft_payloads.js
 * Capture: authed = logged-in session; anon = incognito or cleared cookies.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname);
const authedPath = path.join(dir, 'draft_authed.json');
const anonPath = path.join(dir, 'draft_anon.json');

function load(name, p) {
  if (!fs.existsSync(p)) {
    console.log(`${name}: file not found (${p}). Save GET .../draft response as ${path.basename(p)}.`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`${name}: invalid JSON`, e.message);
    return null;
  }
}

const authed = load('authed', authedPath);
const anon = load('anon', anonPath);

if (authed == null || anon == null) {
  process.exit(1);
}

function keys(obj) {
  return obj && typeof obj === 'object' ? Object.keys(obj).sort() : [];
}

function previewKeys(o) {
  const d = o?.draft;
  const p = d?.preview;
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      return Object.keys(parsed || {}).sort();
    } catch (_) { return []; }
  }
  return keys(p);
}

const topDiff = keys(authed).filter(k => !keys(anon).includes(k)).length || keys(anon).filter(k => !keys(authed).includes(k)).length;
const hasDraftAuthed = !!authed.draft;
const hasDraftAnon = !!anon.draft;
const previewAuthed = previewKeys(authed);
const previewAnon = previewKeys(anon);
const previewMissingInAnon = previewAuthed.filter(k => !previewAnon.includes(k));
const previewExtraInAnon = previewAnon.filter(k => !previewAuthed.includes(k));

console.log('--- Top-level keys ---');
console.log('authed:', keys(authed).join(', '));
console.log('anon:  ', keys(anon).join(', '));
if (topDiff) console.log('MISMATCH: different top-level keys');
else console.log('OK: same top-level keys');

console.log('\n--- draft presence ---');
console.log('authed has draft:', hasDraftAuthed);
console.log('anon has draft: ', hasDraftAnon);
if (hasDraftAuthed && !hasDraftAnon) console.log('ISSUE: hero/avatar/categories missing for anon (no draft object)');
else if (!hasDraftAuthed && hasDraftAnon) console.log('Anon has draft but authed does not (unexpected)');
else if (hasDraftAuthed && hasDraftAnon) console.log('OK: both have draft');

console.log('\n--- draft.preview (hero/avatar/categories) ---');
console.log('authed preview keys:', previewAuthed.join(', ') || '(none)');
console.log('anon preview keys:  ', previewAnon.join(', ') || '(none)');
if (previewMissingInAnon.length) console.log('MISSING in anon:', previewMissingInAnon.join(', '));
if (previewExtraInAnon.length) console.log('EXTRA in anon:', previewExtraInAnon.join(', '));
if (!previewMissingInAnon.length && !previewExtraInAnon.length && previewAuthed.length) console.log('OK: same preview shape');
if (previewMissingInAnon.length && previewMissingInAnon.some(k => /hero|avatar|brand|categories/i.test(k))) {
  console.log('ROOT CAUSE: auth gating strips preview.hero/avatar/categories for anon.');
}

console.log('\n--- products/categories arrays ---');
console.log('authed products:', Array.isArray(authed.products) ? authed.products.length : 'N/A', 'categories:', Array.isArray(authed.categories) ? authed.categories.length : 'N/A');
console.log('anon products: ', Array.isArray(anon.products) ? anon.products.length : 'N/A', 'categories:', Array.isArray(anon.categories) ? anon.categories.length : 'N/A');
