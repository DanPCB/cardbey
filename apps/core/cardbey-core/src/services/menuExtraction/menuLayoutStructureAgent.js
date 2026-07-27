/**
 * Menu Layout Structure Specialist Agent
 *
 * Focus: visual layout only — columns, bands, section boxes, reading order.
 * Does NOT extract prices/items. Those stay in menuVisionExtract.
 *
 * Soft-fail by design: callers must continue extraction if this returns null.
 */

import OpenAI from 'openai';
import { MenuExtractionLlmError } from './menuExtractionLlmError.js';

export const MENU_LAYOUT_STRUCTURE_VERSION = 1;

export const MENU_LAYOUT_STRUCTURE_PROMPT = `You are a specialist layout agent for menus, spa price boards, beauty lists, and restaurant menus.

Analyze ONLY the visual structure of this image. Do NOT extract every price row as catalog items.

Identify layout regions (sections / price tables / headers / footers):
- Columns side-by-side (e.g. left RELAXATION, right DEEP TISSUE)
- Full-width bands under columns (e.g. DOUBLE spanning the page)
- Vertical stacks of categories
- Decorative dividers that separate sections

Return ONLY valid JSON (no markdown), shape:
{
  "layoutPattern": "multi_column_bands" | "single_column" | "grid" | "mixed" | "unknown",
  "confidence": 0.0-1.0,
  "regions": [
    {
      "id": "r1",
      "role": "section" | "header" | "footer" | "price_table" | "decorative",
      "heading": "exact section title as printed (keep typos if printed)",
      "readingOrder": 1,
      "band": 0,
      "column": 0,
      "span": "half" | "full" | "third" | "unknown",
      "bbox": { "x": 0.0, "y": 0.0, "w": 0.5, "h": 0.4 },
      "contentHint": "duration x price rows" | "package inclusions" | "single prices" | "title only" | ""
    }
  ],
  "extractionHints": [
    "Short imperative hints for the item extractor"
  ]
}

Rules:
- bbox values are normalized 0–1 relative to the full image (x,y = top-left; w,h = size)
- readingOrder is left-to-right then top-to-bottom (human reading)
- band increases downward; column increases rightward within a band
- If two columns show SEPARATE price lists, they are SEPARATE regions — never suggest merging them
- Only suggest merging style names when they clearly share ONE price table
- Prefer section headings exactly as printed
- extractionHints must call out column splits and spanning bands
- Ignore social handles / phone / hours as sellable regions (role header/footer only if present)`;

/**
 * @param {string} raw
 */
function stripJsonFence(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  s = s.replace(/```\s*$/i, '').trim();
  return s;
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function finite01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
export function normalizeMenuLayoutStructure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const regionsIn = Array.isArray(raw.regions) ? raw.regions : [];
  const regions = [];
  for (let i = 0; i < regionsIn.length; i += 1) {
    const r = regionsIn[i];
    if (!r || typeof r !== 'object') continue;
    const bboxRaw = r.bbox && typeof r.bbox === 'object' ? r.bbox : {};
    const x = finite01(bboxRaw.x) ?? 0;
    const y = finite01(bboxRaw.y) ?? 0;
    const w = finite01(bboxRaw.w ?? bboxRaw.width) ?? 0;
    const h = finite01(bboxRaw.h ?? bboxRaw.height) ?? 0;
    const heading = typeof r.heading === 'string' ? r.heading.trim() : '';
    const role = typeof r.role === 'string' ? r.role.trim().toLowerCase() : 'section';
    const readingOrder = Number.isFinite(Number(r.readingOrder))
      ? Number(r.readingOrder)
      : i + 1;
    regions.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `r${i + 1}`,
      role: ['section', 'header', 'footer', 'price_table', 'decorative'].includes(role)
        ? role
        : 'section',
      heading,
      readingOrder,
      band: Number.isFinite(Number(r.band)) ? Number(r.band) : 0,
      column: Number.isFinite(Number(r.column)) ? Number(r.column) : 0,
      span: typeof r.span === 'string' ? r.span : 'unknown',
      bbox: { x, y, w, h },
      contentHint: typeof r.contentHint === 'string' ? r.contentHint.trim() : '',
    });
  }

  if (!regions.length) return null;

  regions.sort((a, b) => a.readingOrder - b.readingOrder || a.band - b.band || a.column - b.column);

  const hints = Array.isArray(raw.extractionHints)
    ? raw.extractionHints.map((h) => String(h || '').trim()).filter(Boolean)
    : [];

  const pattern =
    typeof raw.layoutPattern === 'string' && raw.layoutPattern.trim()
      ? raw.layoutPattern.trim()
      : 'unknown';

  const confidence = finite01(raw.confidence) ?? 0.5;

  return {
    version: MENU_LAYOUT_STRUCTURE_VERSION,
    layoutPattern: pattern,
    confidence,
    regions,
    extractionHints: hints.length
      ? hints
      : buildDefaultExtractionHints(regions, pattern),
  };
}

/**
 * @param {object[]} regions
 * @param {string} pattern
 */
function buildDefaultExtractionHints(regions, pattern) {
  const hints = [`Layout pattern: ${pattern}`];
  const sections = regions.filter((r) => r.role === 'section' || r.role === 'price_table');
  for (const r of sections) {
    const title = r.heading || r.id;
    hints.push(
      `Region ${r.readingOrder}: "${title}" (band ${r.band}, column ${r.column}, span ${r.span}) — keep as its own category/section`,
    );
  }
  const multiCol = sections.some((r) => r.column > 0) || sections.filter((r) => r.band === 0).length > 1;
  if (multiCol) {
    hints.push(
      'Side-by-side columns with separate price lists are SEPARATE offerings — do not merge them into one shared price table',
    );
  }
  return hints;
}

/**
 * @param {string} text
 * @returns {object | null}
 */
export function parseMenuLayoutStructureJson(text) {
  const cleaned = stripJsonFence(text);
  try {
    return normalizeMenuLayoutStructure(JSON.parse(cleaned));
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return normalizeMenuLayoutStructure(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Prompt block injected into the item extractor.
 * @param {object | null | undefined} layout
 */
export function formatLayoutHintsForExtraction(layout) {
  if (!layout || !Array.isArray(layout.regions) || !layout.regions.length) return '';
  const lines = [
    'LAYOUT STRUCTURE (from specialist layout agent — follow this organization):',
    `Pattern: ${layout.layoutPattern || 'unknown'} (confidence ${layout.confidence ?? '?'})`,
  ];
  for (const r of layout.regions) {
    if (r.role === 'decorative') continue;
    lines.push(
      `- [${r.readingOrder}] ${r.role} "${r.heading || '(untitled)'}" band=${r.band} col=${r.column} span=${r.span}` +
        (r.contentHint ? ` · ${r.contentHint}` : ''),
    );
  }
  if (Array.isArray(layout.extractionHints) && layout.extractionHints.length) {
    lines.push('Extraction rules from layout:');
    for (const h of layout.extractionHints) lines.push(`- ${h}`);
  }
  lines.push(
    'Assign each extracted item category to the matching region heading. Preserve readingOrder as section order.',
  );
  return lines.join('\n');
}

/**
 * Whether the layout specialist is enabled.
 */
export function isMenuLayoutStructureAgentEnabled() {
  const v = String(process.env.MENU_LAYOUT_STRUCTURE_AGENT ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

/**
 * Run layout specialist on an image buffer.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {{ businessName?: string; businessType?: string }} [ctx]
 * @returns {Promise<object | null>}
 */
export async function analyzeMenuLayoutFromImageBuffer(fileBuffer, mimeType, ctx = {}) {
  if (!isMenuLayoutStructureAgentEnabled()) return null;

  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 45000,
        maxRetries: 1,
      })
    : null;
  if (!openai) {
    // Soft-fail: no key → skip layout (item extract will throw its own error if needed)
    return null;
  }

  const mime = mimeType && /^image\//i.test(mimeType) ? mimeType : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${fileBuffer.toString('base64')}`;
  const businessName = String(ctx.businessName || '').trim() || 'this business';
  const businessType = String(ctx.businessType || '').trim() || 'services';

  try {
    const completion = await openai.chat.completions.create({
      model:
        process.env.MENU_LAYOUT_MODEL?.trim() ||
        process.env.MENU_VISION_MODEL?.trim() ||
        'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are Cardbey\'s menu layout structure specialist. Return only JSON describing visual regions, columns, bands, and reading order. Never invent catalog prices.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${MENU_LAYOUT_STRUCTURE_PROMPT}\n\nStore context: ${businessName} (${businessType}).`,
            },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices?.[0]?.message?.content ?? '';
    const layout = parseMenuLayoutStructureJson(raw);
    if (!layout) {
      console.warn('[menu-layout] specialist returned unusable JSON');
      return null;
    }
    console.log('[menu-layout] structure detected', {
      pattern: layout.layoutPattern,
      regionCount: layout.regions.length,
      confidence: layout.confidence,
      headings: layout.regions.map((r) => r.heading).filter(Boolean).slice(0, 8),
    });
    return layout;
  } catch (e) {
    // Soft-fail — never block extraction
    console.warn('[menu-layout] specialist failed (continuing without layout)', {
      error: e?.message || String(e),
    });
    if (e instanceof MenuExtractionLlmError) return null;
    return null;
  }
}

/**
 * Reorder Menu Document sections using layout reading order when headings match.
 * @param {object} menuDocument
 * @param {object | null | undefined} layout
 */
export function applyLayoutOrderToMenuDocument(menuDocument, layout) {
  if (!menuDocument || !Array.isArray(menuDocument.sections) || !layout?.regions?.length) {
    return menuDocument;
  }
  const sectionRegions = layout.regions.filter(
    (r) => (r.role === 'section' || r.role === 'price_table') && r.heading,
  );
  if (!sectionRegions.length) return menuDocument;

  const orderIndex = new Map();
  for (const r of sectionRegions) {
    orderIndex.set(r.heading.trim().toLowerCase(), r.readingOrder);
  }

  const scored = menuDocument.sections.map((s, idx) => {
    const key = String(s.name || '').trim().toLowerCase();
    let order = orderIndex.get(key);
    if (order == null) {
      // fuzzy: layout heading contained in section name or vice versa
      for (const [h, o] of orderIndex.entries()) {
        if (key.includes(h) || h.includes(key)) {
          order = o;
          break;
        }
      }
    }
    return { section: s, order: order ?? 1000 + idx };
  });
  scored.sort((a, b) => a.order - b.order);
  return {
    ...menuDocument,
    sections: scored.map((s) => s.section),
    layout,
  };
}
