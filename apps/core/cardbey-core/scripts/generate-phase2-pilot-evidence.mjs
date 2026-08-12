/**
 * Writes structural six-business render evidence for Phase 2 pilot docs.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { composeGroundedStoreIntelligence } from '../src/lib/storeGeneration/buildGroundedComposition.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../../../../docs/store-generation/pilot-evidence');

const pilots = [
  {
    id: 'finance',
    name: 'AWE Financial',
    input: {
      businessName: 'AWE Financial',
      category: 'Finance broker',
      businessType: 'mortgage broker',
      detectedServices: [
        'Home loans',
        'Debt consolidation',
        'Low-doc loans',
        'Property investment',
        'Refinancing',
      ],
      primaryColor: '#0B1F3A',
      secondaryColor: '#1B4F8A',
      location: 'Sydney NSW',
    },
  },
  {
    id: 'cafe',
    name: 'Country Cafe',
    input: {
      businessName: 'Country Cafe',
      category: 'Cafe',
      ocrRawText: ['Eggs Your Way', 'Eggs Benedict', 'Spicy Chorizo & Eggs', 'Smashed Avo', 'Flat White'].join(
        '\n',
      ),
      primaryColor: '#5C4033',
      location: 'Byron Bay',
      hours: '7am–3pm',
    },
  },
  {
    id: 'takeaway',
    name: 'Noodle Hut',
    input: {
      businessName: 'Noodle Hut',
      category: 'Takeaway',
      businessType: 'noodle takeaway',
      ocrRawText: ['Beef Pho', 'Chicken Laksa', 'Pad Thai', 'Spring Rolls'].join('\n'),
      primaryColor: '#E85D04',
      secondaryColor: '#111111',
    },
  },
  {
    id: 'home',
    name: 'Harbour Plumbing',
    input: {
      businessName: 'Harbour Plumbing',
      category: 'Plumbing',
      businessType: 'home plumbing service',
      detectedServices: [
        'Blocked drains',
        'Hot water systems',
        'Bathroom plumbing',
        'Emergency call-out',
      ],
      location: 'Inner West Sydney',
    },
  },
  {
    id: 'beauty',
    name: 'Luna Hair Studio',
    input: {
      businessName: 'Luna Hair Studio',
      category: 'Hair salon',
      businessType: 'beauty salon',
    },
  },
  {
    id: 'retail',
    name: 'Northside Outfitters',
    input: {
      businessName: 'Northside Outfitters',
      category: 'Retail fashion',
      businessType: 'clothing boutique',
      products: ['Linen Shirt', 'Canvas Tote', 'Wool Beanie', 'Everyday Sneakers'],
      primaryColor: '#111827',
    },
  },
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const cards = pilots.map((p) => ({ ...p, c: composeGroundedStoreIntelligence(p.input) }));

const css = `
  :root { font-family: Georgia, 'Times New Roman', serif; }
  body { margin: 0; padding: 24px; background: linear-gradient(160deg,#e8e4dc,#f4f6f8 40%,#dce3ea); color: #1a1a1a; }
  h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 8px; }
  .sub { margin: 0 0 28px; max-width: 52rem; color: #444; font-size: 0.95rem; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; }
  @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
  .card { min-height: 420px; display: flex; flex-direction: column; border: 1px solid rgba(0,0,0,.08); overflow: hidden; }
  .hero { padding: 28px 22px 22px; color: #fff; flex: 0 0 auto; }
  .hero .brand { font-size: 1.35rem; letter-spacing: .02em; margin: 0 0 6px; }
  .hero .cta { display: inline-block; margin-top: 14px; padding: 8px 14px; background: rgba(255,255,255,.92); color: #111; font-size: .8rem; text-decoration: none; font-family: system-ui,sans-serif; }
  .body { padding: 16px 18px 20px; background: #fff; flex: 1; font-family: system-ui,sans-serif; font-size: .82rem; }
  .label { text-transform: uppercase; letter-spacing: .08em; font-size: .65rem; color: #666; margin: 12px 0 4px; }
  .label:first-child { margin-top: 0; }
  ul { margin: 0; padding-left: 1.1rem; }
  .meta { color: #555; }
  .sections { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { background: #f0f0f0; padding: 2px 7px; font-size: .7rem; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Phase 2 Pilot — Structural Render Evidence</title><style>${css}</style></head><body>
<h1>Phase 2 pilot — six business compositions</h1>
<p class="sub">Structural render evidence (not live storefront screenshots). Differentiate by layout hierarchy, CTA, offerings, and theme.</p>
<div class="grid">
${cards
  .map(({ name, c }) => {
    const primary = c.plan.themeSpec?.primary || '#333';
    const secondary = c.plan.themeSpec?.secondary || primary;
    const offerings = (c.groundedOfferings || []).slice(0, 6);
    const sections = (c.plan.sectionPriority || []).slice(0, 7);
    return `<article class="card">
    <header class="hero" style="background:linear-gradient(145deg,${primary},${secondary})">
      <p class="brand">${esc(name)}</p>
      <div class="meta">${esc(c.plan.archetype)} · ${esc(c.brand.tone || '')}</div>
      <a class="cta" href="#">${esc(c.plan.primaryCTA)}</a>
    </header>
    <div class="body">
      <div class="label">Offerings</div>
      <ul>${
        offerings.length
          ? offerings.map((o) => `<li>${esc(o)}</li>`).join('')
          : '<li class="meta">(sparse — none invented)</li>'
      }</ul>
      <div class="label">Section hierarchy</div>
      <div class="sections">${sections.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      <div class="label">Presentation / secondary CTA</div>
      <div class="meta">${esc(c.plan.offeringPresentation)} · ${esc(c.plan.secondaryCTA || '—')}</div>
      <div class="label">Theme</div>
      <div class="meta">${esc(primary)} / ${esc(c.brand.graphicLanguage || '—')}</div>
      <div class="label">Gate</div>
      <div class="meta">${c.gate.ok ? 'ok' : `fail: ${esc((c.gate.reasons || []).join(', '))}`}</div>
    </div>
  </article>`;
  })
  .join('')}
</div></body></html>`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'phase2-six-business-render.html'), html);
writeFileSync(
  join(outDir, 'phase2-six-business-fingerprints.json'),
  JSON.stringify(
    cards.map(({ id, name, c }) => ({
      id,
      name,
      archetype: c.plan.archetype,
      primaryCTA: c.plan.primaryCTA,
      secondaryCTA: c.plan.secondaryCTA,
      sectionPriority: c.plan.sectionPriority,
      offeringPresentation: c.plan.offeringPresentation,
      offerings: c.groundedOfferings,
      theme: c.plan.themeSpec,
      brandTone: c.brand.tone,
      gate: c.gate,
      resourceNeeds: Object.keys(c.plan.resourceNeeds || {}),
    })),
    null,
    2,
  ),
);
console.log('wrote', outDir);
