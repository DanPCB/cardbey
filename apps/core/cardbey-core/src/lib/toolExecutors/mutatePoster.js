import { llmGateway } from '../llm/llmGateway.ts';

/**
 * @param {{ instruction: string; currentElements: object[] }} input
 */
export async function interpretPosterMutation({ instruction, currentElements }) {
  const elementSummary = (currentElements ?? [])
    .map((el) => {
      const id = el?.id ?? '?';
      const type = el?.type ?? '?';
      const preview =
        type === 'text'
          ? String(el?.content ?? '').slice(0, 80)
          : type === 'image' || type === 'image_circle'
            ? String(el?.src ?? '').slice(0, 80)
            : '';
      return `- ${id} (${type})${preview ? `: ${preview}` : ''}`;
    })
    .join('\n');

  const prompt = `You interpret natural-language edits to a marketing poster canvas.

Current elements:
${elementSummary || '(none)'}

User instruction: ${String(instruction ?? '').trim()}

Respond with JSON only:
{
  "elementId": "stable element id e.g. title, subtitle, photo_1, background",
  "type": "text_replace" | "image_replace" | "color_change" | "font_size",
  "value": "new text when text_replace",
  "newSrc": "image url when image_replace",
  "color": "#hex when color_change",
  "size": 48 when font_size
}

Use stable ids from the list. Prefer text_replace for title/subtitle/phone/cta changes.`;

  const tenantKey =
    (typeof process.env.DEFAULT_TENANT_KEY === 'string' && process.env.DEFAULT_TENANT_KEY.trim()) ||
    'default';

  const { text } = await llmGateway.generate({
    purpose: 'mutate_poster',
    prompt,
    tenantKey,
    responseFormat: 'json',
    maxTokens: 400,
  });

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('LLM did not return a valid mutation JSON');
  }

  return JSON.parse(text.slice(start, end + 1));
}

/**
 * @param {object[]} elements
 * @param {object} mutation
 */
export function applyMutation(elements, mutation) {
  return elements.map((el) => {
    if (el.id !== mutation.elementId) return el;
    switch (mutation.type) {
      case 'text_replace':
        return { ...el, content: mutation.value };
      case 'image_replace':
        return { ...el, src: mutation.newSrc };
      case 'color_change':
        return { ...el, style: { ...el.style, color: mutation.color } };
      case 'font_size':
        return { ...el, style: { ...el.style, fontSize: mutation.size } };
      default:
        return el;
    }
  });
}

function getMutationSummary(mutation) {
  switch (mutation?.type) {
    case 'text_replace':
      return `Title updated to ${mutation.value}`;
    case 'image_replace':
      return 'Image updated';
    case 'color_change':
      return 'Color updated';
    case 'font_size':
      return 'Font size updated';
    default:
      return 'Poster updated';
  }
}

/**
 * @param {object} params
 * @param {string} [params.posterId]
 * @param {string} params.instruction
 * @param {object[]} params.currentElements
 */
export async function mutatePoster(params = {}) {
  const { instruction, currentElements } = params;

  const mutation = await interpretPosterMutation({
    instruction,
    currentElements,
  });

  const updatedElements = applyMutation(currentElements ?? [], mutation);

  return {
    ok: true,
    mutation,
    updatedElements,
    summary: `Done! ${getMutationSummary(mutation)}`,
  };
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = undefined) {
  const instruction =
    input?.instruction ??
    input?.description ??
    context?.instruction ??
    '';
  const currentElements = Array.isArray(input?.currentElements)
    ? input.currentElements
    : Array.isArray(context?.currentElements)
      ? context.currentElements
      : [];

  if (!String(instruction).trim()) {
    return {
      status: 'failed',
      error: { code: 'MISSING_INSTRUCTION', message: 'instruction is required' },
    };
  }

  if (!currentElements.length) {
    return {
      status: 'failed',
      error: { code: 'MISSING_ELEMENTS', message: 'currentElements is required' },
    };
  }

  try {
    const result = await mutatePoster({
      posterId: input?.posterId ?? null,
      instruction,
      currentElements,
    });

    return {
      status: 'ok',
      output: {
        ok: true,
        ...result,
        message: result.summary,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      error: { code: 'MUTATE_POSTER_ERROR', message },
    };
  }
}
