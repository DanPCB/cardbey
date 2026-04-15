import { getPrismaClient } from '../lib/prisma.js';
import { getMiniWebsiteSnapshot, mergeSectionPatches } from '../lib/miniWebsiteSectionMerge.js';

// Keep stdout clean JSON-only; send any logs to stderr.
console.log = (...args) => process.stderr.write(`${args.map(String).join(' ')}\n`);
console.warn = (...args) => process.stderr.write(`${args.map(String).join(' ')}\n`);
console.error = (...args) => process.stderr.write(`${args.map(String).join(' ')}\n`);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

function ok(output) {
  return { status: 'ok', output: output ?? {} };
}
function failed(code, message) {
  return { status: 'failed', error: { code, message } };
}
function blocked(code, message, requiredAction) {
  return { status: 'blocked', blocker: { code, message, requiredAction } };
}

async function runChangeHeroHeadline(input = {}) {
  const storeId = typeof input.storeId === 'string' ? input.storeId.trim() : '';
  const draftId = typeof input.draftId === 'string' ? input.draftId.trim() : '';
  const headline = typeof input.headline === 'string' ? input.headline.trim() : '';
  const subheadline = typeof input.subheadline === 'string' ? input.subheadline.trim() : '';

  if (!storeId && !draftId) {
    return blocked('STORE_OR_DRAFT_ID_REQUIRED', 'Provide storeId or draftId', 'Provide storeId or draftId');
  }
  if (!headline && !subheadline) {
    return blocked(
      'HERO_TEXT_REQUIRED',
      'Provide at least one of headline or subheadline',
      'Provide headline and/or subheadline',
    );
  }

  const prisma = getPrismaClient();
  const updatedTargets = { business: false, draft: false };

  if (draftId) {
    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { preview: true },
    });
    if (!draft) {
      return failed('DRAFT_NOT_FOUND', 'Draft not found');
    }
    const wasString = typeof draft.preview === 'string';
    const previewObj =
      typeof draft.preview === 'object' && draft.preview && !Array.isArray(draft.preview)
        ? draft.preview
        : typeof draft.preview === 'string'
          ? (() => {
              try {
                return JSON.parse(draft.preview || '{}');
              } catch {
                return {};
              }
            })()
          : {};

    const nextPreview = { ...previewObj };
    const website = nextPreview.website && typeof nextPreview.website === 'object' ? { ...nextPreview.website } : {};
    const sectionsRaw = Array.isArray(website.sections) ? website.sections : [];
    const sections = sectionsRaw.map((s) => (s && typeof s === 'object' ? { ...s } : s));
    const idx = sections.findIndex((s) => s && typeof s === 'object' && s.type === 'hero');
    const existingHero =
      idx >= 0 && sections[idx] && typeof sections[idx] === 'object'
        ? sections[idx]
        : { type: 'hero', content: {} };
    const heroContent =
      existingHero.content && typeof existingHero.content === 'object' ? { ...existingHero.content } : {};
    const nextHero = {
      ...existingHero,
      type: 'hero',
      content: {
        ...heroContent,
        ...(headline ? { headline } : {}),
        ...(subheadline ? { subheadline } : {}),
      },
    };
    if (idx >= 0) sections[idx] = nextHero;
    else sections.unshift(nextHero);
    website.sections = sections;
    nextPreview.website = website;

    await prisma.draftStore.update({
      where: { id: draftId },
      data: { preview: wasString ? JSON.stringify(nextPreview) : nextPreview, updatedAt: new Date() },
    });
    updatedTargets.draft = true;
  }

  if (storeId) {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { stylePreferences: true },
    });
    if (!business) {
      return failed('STORE_NOT_FOUND', 'Store not found');
    }

    const existing =
      business.stylePreferences && typeof business.stylePreferences === 'object' && !Array.isArray(business.stylePreferences)
        ? business.stylePreferences
        : {};

    const { sections: prevSections, theme: prevTheme, miniBase } = getMiniWebsiteSnapshot(existing);
    const patch = [
      {
        type: 'hero',
        content: {
          ...(headline ? { headline } : {}),
          ...(subheadline ? { subheadline } : {}),
        },
      },
    ];
    const nextSections = mergeSectionPatches(prevSections, patch);
    const updatedMini = {
      ...miniBase,
      sections: nextSections,
      theme: prevTheme,
      updatedAt: new Date().toISOString(),
    };

    await prisma.business.update({
      where: { id: storeId },
      data: {
        stylePreferences: { ...existing, miniWebsite: updatedMini },
        updatedAt: new Date(),
      },
    });
    updatedTargets.business = true;

    return ok({
      storeId,
      draftId: draftId || null,
      updated: { headline: headline || null, subheadline: subheadline || null },
      targets: updatedTargets,
      sectionsCount: Array.isArray(nextSections) ? nextSections.length : 0,
    });
  }

  return ok({
    storeId: null,
    draftId,
    updated: { headline: headline || null, subheadline: subheadline || null },
    targets: updatedTargets,
  });
}

async function main() {
  try {
    const raw = await readStdin();
    const payload = raw ? JSON.parse(raw) : {};
    const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
    const input = payload.input && typeof payload.input === 'object' ? payload.input : {};

    if (toolName === 'change_hero_headline') {
      const res = await runChangeHeroHeadline(input);
      process.stdout.write(JSON.stringify(res));
      return;
    }

    process.stdout.write(
      JSON.stringify(failed('UNKNOWN_TOOL', `localToolRunner cannot handle tool: ${toolName || '(missing)'}`)),
    );
  } catch (e) {
    process.stdout.write(JSON.stringify(failed('LOCAL_RUNNER_ERROR', e?.message || String(e))));
  }
}

await main();

