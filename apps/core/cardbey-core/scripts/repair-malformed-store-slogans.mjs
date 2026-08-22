#!/usr/bin/env node
/**
 * Dry-run (default) repair for malformed Business.tagline / DraftStore preview slogans.
 *
 * Usage:
 *   node scripts/repair-malformed-store-slogans.mjs
 *   node scripts/repair-malformed-store-slogans.mjs --apply
 *
 * Only rewrites rows where sanitizeStoreSlogan produces a different, valid slogan.
 * Does not call the LLM. Ambiguous empties are flagged, not overwritten.
 */

import { PrismaClient } from '@prisma/client';
import {
  sanitizeStoreSlogan,
  isCustomerFacingSlogan,
  looksLikeSloganMeta,
} from '../src/lib/contentResolution/sanitizeStoreSlogan.js';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function shouldRepair(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  if (!looksLikeSloganMeta(raw) && !/[*"']/.test(raw) && !/^slogan\s*:/i.test(raw)) {
    return null;
  }
  const cleaned = sanitizeStoreSlogan(raw, 160);
  if (!cleaned || cleaned === raw.trim()) return null;
  if (!isCustomerFacingSlogan(cleaned)) {
    return { action: 'flag', raw, cleaned: null };
  }
  return { action: 'repair', raw, cleaned };
}

async function main() {
  const businesses = await prisma.business.findMany({
    where: { tagline: { not: null } },
    select: { id: true, name: true, tagline: true },
    take: 5000,
  });

  const drafts = await prisma.draftStore.findMany({
    select: { id: true, preview: true },
    take: 5000,
  });

  const report = { businessRepairs: [], businessFlags: [], draftRepairs: [], draftFlags: [] };

  for (const b of businesses) {
    const decision = shouldRepair(b.tagline);
    if (!decision) continue;
    if (decision.action === 'flag') {
      report.businessFlags.push({ id: b.id, name: b.name, tagline: b.tagline });
      continue;
    }
    report.businessRepairs.push({ id: b.id, name: b.name, from: b.tagline, to: decision.cleaned });
    if (APPLY) {
      await prisma.business.update({
        where: { id: b.id },
        data: { tagline: decision.cleaned },
      });
    }
  }

  for (const d of drafts) {
    const p = d.preview && typeof d.preview === 'object' ? d.preview : null;
    if (!p) continue;
    const fields = ['tagline', 'slogan'];
    let next = null;
    for (const field of fields) {
      const decision = shouldRepair(p[field]);
      if (!decision) continue;
      if (decision.action === 'flag') {
        report.draftFlags.push({ id: d.id, field, value: p[field] });
        continue;
      }
      if (!next) next = { ...p };
      next[field] = decision.cleaned;
      if (field === 'slogan') next.tagline = decision.cleaned;
      if (field === 'tagline') next.slogan = decision.cleaned;
      report.draftRepairs.push({ id: d.id, field, from: p[field], to: decision.cleaned });
    }
    if (APPLY && next) {
      // Also sync website hero subheadline when present.
      const w = next.website;
      if (w && typeof w === 'object' && Array.isArray(w.sections)) {
        next.website = {
          ...w,
          sections: w.sections.map((sec) => {
            if (!sec || sec.type !== 'hero' || !sec.content || typeof sec.content !== 'object') {
              return sec;
            }
            const sub = sec.content.subheadline;
            const decision = shouldRepair(sub);
            if (decision?.action === 'repair') {
              return { ...sec, content: { ...sec.content, subheadline: decision.cleaned } };
            }
            if (next.slogan || next.tagline) {
              return {
                ...sec,
                content: { ...sec.content, subheadline: next.slogan || next.tagline },
              };
            }
            return sec;
          }),
        };
      }
      await prisma.draftStore.update({
        where: { id: d.id },
        data: { preview: next },
      });
    }
  }

  console.log(JSON.stringify({ apply: APPLY, ...report, counts: {
    businessRepairs: report.businessRepairs.length,
    businessFlags: report.businessFlags.length,
    draftRepairs: report.draftRepairs.length,
    draftFlags: report.draftFlags.length,
  } }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
