/**
 * designGeneratorSkill — LLM → DesignSpec JSON for Contents Studio / Konva adapter.
 * Uses llmGateway.generate (same stack as intake / classifier).
 */

import { llmGateway } from '../../lib/llm/llmGateway.ts';

function parseJsonObjectFromLlmText(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  const stripFences = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const o = JSON.parse(stripFences);
    return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    const start = stripFences.indexOf('{');
    const end = stripFences.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const o = JSON.parse(stripFences.slice(start, end + 1));
        return o != null && typeof o === 'object' && !Array.isArray(o) ? o : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function formatSize(format) {
  const map = {
    signage_landscape: { width: 1920, height: 1080 },
    banner_landscape: { width: 1920, height: 600 },
    banner_square: { width: 1080, height: 1080 },
    story_portrait: { width: 1080, height: 1920 },
    poster_a4: { width: 1240, height: 1754 },
    catalog_card: { width: 1200, height: 1600 },
  };
  return map[format] || map.signage_landscape;
}

const BASE_SYSTEM_PROMPT = `You are a senior graphic designer for retail signage and social posts. You output ONE JSON object only (no markdown fences, no commentary) for Cardbey Contents Studio.

The JSON MUST match this shape:
{
  "version": "1.0",
  "format": string,
  "width": number,
  "height": number,
  "background": {
    "type": "solid" | "gradient",
    "color"?: string,
    "from"?: string,
    "to"?: string,
    "direction"?: "horizontal" | "vertical" | "diagonal"
  },
  "layers": Layer[],
  "brandKit"?: { "logoUrl": string | null, "qrCodeUrl": string | null, "name": string }
}

Layer union (each item has "id", "type", "x", "y", and type-specific fields):
- { "type":"rect", "id", "x", "y", "width", "height", "fill", "opacity"?, "cornerRadius"? }
- { "type":"text", "id", "x", "y", "text", "fontSize", "fontFamily", "fill", "fontStyle"?, "align"?: "left"|"center"|"right", "width"?, "lineHeight"?, "letterSpacing"?, "opacity"? }
  fontStyle must be one of: "normal", "bold", "italic", "bold italic"
- { "type":"image", "id", "x", "y", "width", "height", "src": string | null, "opacity"? }
- { "type":"circle", "id", "x", "y", "radius", "fill", "opacity"? }
- { "type":"storeAsset", "id", "x", "y", "width", "height", "asset": "logo" | "qrCode", "opacity"? }

Rules:
- Use "layers" in back-to-front paint order (first = bottom).
- Prefer readable contrast; keep text inside the canvas (0..width / 0..height).
- Coordinates are top-left for rect/text/image; circle uses center (x,y) + radius.
- For storeAsset layers, set asset to "logo" or "qrCode"; URLs come from brandKit in your output.
- Include 2–6 layers unless the user asks for minimal design.

When refining an existing design (patch mode — user message includes patchSpec), you MUST reuse the same layer "id" values from patchSpec.layers for every layer that corresponds to an existing layer. Never generate new IDs for layers that already exist. Only generate new IDs for genuinely new layers you are adding. Return the complete updated "layers" array and "background" when it should change.`;

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} opts.format
 * @param {object|null} opts.patchSpec
 * @param {object|null} opts.brandKit { logoUrl, qrCodeUrl, name, tagline?, primaryColor?, secondaryColor? }
 * @param {{ width: number, height: number }} opts.canvasSize
 * @param {string} opts.tenantKey
 * @returns {Promise<object>} DesignSpec
 */
export async function generateDesignSpecWithLlm(opts) {
  const {
    prompt,
    format,
    patchSpec,
    brandKit,
    canvasSize,
    tenantKey,
  } = opts;

  const patchBlock =
    patchSpec && typeof patchSpec === 'object'
      ? `\n\nPATCH SPEC (current canvas — preserve layer ids as required):\n${JSON.stringify(patchSpec).slice(0, 24000)}`
      : '';

  const brandBlock =
    brandKit && typeof brandKit === 'object'
      ? `\n\nMERCHANT BRAND CONTEXT:\n${JSON.stringify(brandKit).slice(0, 4000)}`
      : '';

  const userContent = [
    `OUTPUT format preset: ${format}`,
    `CANVAS: width=${canvasSize.width}, height=${canvasSize.height} (you MUST set spec.width and spec.height to these values).`,
    `USER REQUEST:\n${String(prompt).trim()}`,
    brandBlock,
    patchBlock,
  ].join('\n');

  const fullPrompt = `SYSTEM:\n${BASE_SYSTEM_PROMPT}\n\nUSER:\n${userContent}`;

  const model =
    process.env.DESIGN_GENERATOR_MODEL?.trim() ||
    process.env.PERFORMER_INTAKE_LLM_MODEL?.trim() ||
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    'gpt-4o-mini';
  const provider =
    process.env.DESIGN_GENERATOR_PROVIDER?.trim() ||
    process.env.PERFORMER_INTAKE_LLM_PROVIDER?.trim() ||
    undefined;
  const maxTokens = Math.min(
    8192,
    Number(process.env.DESIGN_GENERATOR_MAX_TOKENS || 4096) || 4096,
  );

  const result = await llmGateway.generate({
    purpose: 'design_generator_skill',
    prompt: fullPrompt,
    tenantKey: String(tenantKey || 'design_generator').slice(0, 120),
    model,
    ...(provider ? { provider } : {}),
    maxTokens,
    temperature: 0.35,
    responseFormat: 'json',
  });

  const parsed = parseJsonObjectFromLlmText(result?.text);
  if (!parsed) {
    const err = new Error('design_spec_parse_failed');
    err.code = 'parse_failed';
    throw err;
  }

  const spec = normalizeDesignSpec(parsed, { format, canvasSize, brandKit });
  return spec;
}

/**
 * @param {object} raw
 * @param {{ format: string, canvasSize: { width: number, height: number }, brandKit: object|null }} ctx
 */
function normalizeDesignSpec(raw, ctx) {
  const { format, canvasSize, brandKit } = ctx;
  const { width, height } = canvasSize;
  const spec = { ...raw };
  spec.version = typeof spec.version === 'string' ? spec.version : '1.0';
  spec.format = typeof spec.format === 'string' ? spec.format : format;
  spec.width = Number.isFinite(spec.width) ? spec.width : width;
  spec.height = Number.isFinite(spec.height) ? spec.height : height;
  if (!spec.background || typeof spec.background !== 'object') {
    spec.background = { type: 'solid', color: '#0f172a' };
  }
  if (!Array.isArray(spec.layers)) spec.layers = [];

  if (brandKit && typeof brandKit === 'object' && !spec.brandKit) {
    spec.brandKit = {
      logoUrl: brandKit.logoUrl ?? null,
      qrCodeUrl: brandKit.qrCodeUrl ?? null,
      name: typeof brandKit.name === 'string' ? brandKit.name : '',
    };
  }

  spec.generatedAt = typeof spec.generatedAt === 'string' ? spec.generatedAt : new Date().toISOString();
  return spec;
}

export { formatSize, parseJsonObjectFromLlmText };
